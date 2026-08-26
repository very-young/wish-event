/**
 * 결정론적 시뮬레이션과 재현 검증. (설계 결정 D1)
 *
 * 이 모듈은 클라이언트와 서버가 **똑같이** 사용한다.
 * 클라이언트는 플레이 중 판정에 쓰고, 서버는 제출된 입력 로그를 다시 돌려
 * 성공 주장이 사실인지 확인한다. 같은 코드를 쓰므로 판정이 갈릴 수 없다.
 *
 * 결정론을 지키기 위한 규칙:
 *  - 시간(Date, performance)에 의존하지 않는다. tick만 쓴다.
 *  - Math.random()을 쓰지 않는다. seed 기반 rng만 쓴다.
 *  - 외부 상태를 읽지 않는다.
 */

import { TOTAL_ROUNDS, getRoundConfig, moonRadius } from "./config";
import type { Viewport } from "./coords";
import { createMoonPath, moonPosition } from "./moon-path";
import { initObstacles, stepObstacles } from "./obstacles";
import {
  LAUNCH_PAD,
  evaluateStep,
  launchPlane,
  shouldCancelLaunch,
  stepPlane,
  type Aim,
  type Obstacle,
} from "./physics";

/** 한 발의 발사 기록 */
export interface ShotRecord {
  /** 라운드 시작 기준 tick */
  tick: number;
  /** 발사 방향(라디안) */
  angle: number;
  /** 당김 거리 */
  power: number;
}

/** 한 라운드의 발사 기록 */
export interface RoundRecord {
  round: number;
  shots: ShotRecord[];
}

/** 클라이언트가 서버로 제출하는 입력 로그 */
export interface InputLog {
  rounds: RoundRecord[];
}

/** 한 발의 판정 결과 */
export type ShotResult = "hit" | "blocked" | "out" | "cancelled";

/** 시뮬레이션 최종 결과 */
export interface SimulationResult {
  /** 도달한 라운드 (1~3) */
  reachedRound: number;
  /** 라운드 3까지 명중했는지 */
  success: boolean;
  /** 라운드별 발사 판정 내역 */
  shotResults: ShotResult[][];
  /** 검증 실패 사유. 있으면 입력 로그가 규칙에 맞지 않다는 뜻. */
  invalidReason?: string;
}

/** 한 발이 비행할 수 있는 최대 스텝. 이를 넘으면 빗나감으로 본다. */
const MAX_FLIGHT_STEPS = 600;

/**
 * 한 발을 시뮬레이션한다.
 *
 * @param startTick 발사 시점의 라운드 내 tick
 */
function simulateShot(
  round: number,
  seed: number,
  aim: Aim,
  startTick: number,
  vp: Viewport,
): { result: ShotResult; endTick: number } {
  if (shouldCancelLaunch(aim)) {
    return { result: "cancelled", endTick: startTick };
  }

  const moonPath = createMoonPath(round, seed);
  const moonR = moonRadius(round);
  let plane = launchPlane(aim, vp, LAUNCH_PAD);

  // 발사 시점까지 장애물을 진행시켜 놓는다.
  let obstacles: Obstacle[] = initObstacles(round, seed);
  for (let i = 0; i < startTick; i++) {
    obstacles = stepObstacles(obstacles);
  }

  for (let step = 1; step <= MAX_FLIGHT_STEPS; step++) {
    const tick = startTick + step;
    plane = stepPlane(plane, vp);
    obstacles = stepObstacles(obstacles);
    const moonPos = moonPosition(moonPath, tick);

    const outcome = evaluateStep(plane, moonPos, moonR, obstacles, vp);
    if (outcome.type === "hit") return { result: "hit", endTick: tick };
    if (outcome.type === "blocked")
      return { result: "blocked", endTick: tick };
    if (outcome.type === "out") return { result: "out", endTick: tick };
  }

  // 최대 스텝을 넘겨도 아무 일도 없으면 빗나감으로 처리한다.
  return { result: "out", endTick: startTick + MAX_FLIGHT_STEPS };
}

/**
 * 입력 로그를 재현해 최종 결과를 판정한다.
 *
 * 라운드 1은 무제한 재시도, 라운드 2·3은 1발이다 (요구사항 8.11, 8.13).
 * 규칙에 맞지 않는 로그는 invalidReason과 함께 실패로 처리한다.
 */
export function simulate(
  roundSeeds: readonly number[],
  log: InputLog,
  vp: Viewport,
): SimulationResult {
  const shotResults: ShotResult[][] = [];

  if (roundSeeds.length < TOTAL_ROUNDS) {
    return {
      reachedRound: 1,
      success: false,
      shotResults,
      invalidReason: "라운드 seed 개수가 부족합니다",
    };
  }

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const cfg = getRoundConfig(round);
    const record = log.rounds.find((r) => r.round === round);

    if (!record || record.shots.length === 0) {
      // 이 라운드에 발사 기록이 없으면 여기까지 도달한 것으로 본다.
      return { reachedRound: round, success: false, shotResults };
    }

    // 라운드 2·3의 발사 횟수 제한 검증
    if (cfg.shotsAllowed !== null && record.shots.length > cfg.shotsAllowed) {
      return {
        reachedRound: round,
        success: false,
        shotResults,
        invalidReason: `라운드 ${round}의 발사 횟수가 허용치(${cfg.shotsAllowed})를 초과했습니다`,
      };
    }

    // tick이 증가하는 순서인지 검증. 순서가 뒤엉킨 로그는 조작 신호다.
    for (let i = 1; i < record.shots.length; i++) {
      if (record.shots[i].tick <= record.shots[i - 1].tick) {
        return {
          reachedRound: round,
          success: false,
          shotResults,
          invalidReason: `라운드 ${round}의 발사 시점이 순서대로 정렬되지 않았습니다`,
        };
      }
    }

    const seed = roundSeeds[round - 1];
    const results: ShotResult[] = [];
    let cleared = false;

    for (const shot of record.shots) {
      if (shot.tick < 0 || !Number.isFinite(shot.tick)) {
        return {
          reachedRound: round,
          success: false,
          shotResults,
          invalidReason: `라운드 ${round}에 유효하지 않은 발사 시점이 있습니다`,
        };
      }
      if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power)) {
        return {
          reachedRound: round,
          success: false,
          shotResults,
          invalidReason: `라운드 ${round}에 유효하지 않은 조준값이 있습니다`,
        };
      }

      const { result } = simulateShot(
        round,
        seed,
        { angle: shot.angle, power: shot.power },
        shot.tick,
        vp,
      );
      results.push(result);

      if (result === "hit") {
        cleared = true;
        break;
      }

      // 라운드 2·3은 한 발이라도 빗나가면 종료 (요구사항 8.13)
      if (cfg.shotsAllowed !== null && result !== "cancelled") {
        break;
      }
    }

    shotResults.push(results);

    if (!cleared) {
      return { reachedRound: round, success: false, shotResults };
    }
  }

  return { reachedRound: TOTAL_ROUNDS, success: true, shotResults };
}

/** 서버 검증용 기준 화면 크기. 클라이언트 화면 크기와 무관하게 고정한다. */
export const CANONICAL_VIEWPORT: Viewport = { width: 420, height: 920 };

/**
 * 서버 검증 진입점.
 *
 * 화면 크기를 고정값으로 쓴다. 참여자 화면 크기를 신뢰할 수 없고,
 * 가상 좌표계 덕분에 화면 크기가 판정에 영향을 주지 않아야 하기 때문이다.
 */
export function verifyResult(
  roundSeeds: readonly number[],
  log: InputLog,
): SimulationResult {
  return simulate(roundSeeds, log, CANONICAL_VIEWPORT);
}
