/**
 * 달 궤적 계산. (요구사항 8.3, 8.4, 8.5, 8.8)
 *
 * 순수 함수로 유지한다. 같은 (라운드, tick, seed)는 항상 같은 위치를 내야
 * 서버가 결과를 재현해 검증할 수 있다 (설계 결정 D1).
 *
 * 시안은 프레임마다 tPhase를 누적하고 wanderX에 Math.random()을 썼다.
 * 여기서는 tick으로부터 위상을 계산하고 표류도 seed로 결정론화한다.
 */

import {
  MOON,
  MOON_PHASE_STEP,
  WANDER,
  getRoundConfig,
  moonRadius,
  type RoundConfig,
} from "./config";
import { clamp, type Vec2 } from "./coords";
import { createRng } from "./rng";

/** 라운드 시작 시 계산해두는 궤적 상태. tick마다 재계산하지 않아도 되는 값. */
export interface MoonPathState {
  round: number;
  /** 위상 시작값. seed로 결정되어 매 판마다 다른 지점에서 시작한다. */
  phaseOffset: number;
  /** 라운드 3 표류 경로. tick별로 미리 계산해둔다. */
  wanderTrack: number[] | null;
  /** 이번 판의 궤적 패턴. chaotic 라운드에만 쓰인다. */
  pattern: MoonPattern;
  /** 패턴 전환 tick. 이 시점 이후에는 다음 패턴으로 바뀐다. */
  switchTick: number;
  /** 전환 후 사용할 패턴 */
  nextPattern: MoonPattern;
}

/** 표류 경로를 미리 계산해둘 최대 tick 수. 한 라운드가 이보다 길어지면 순환한다. */
const WANDER_TRACK_LENGTH = 3600; // 60fps 기준 60초

export function createMoonPath(round: number, seed: number): MoonPathState {
  const cfg = getRoundConfig(round);
  const rng = createRng(seed);

  // 위상 시작점을 랜덤화해 매 판 궤적이 달라 보이게 한다.
  const phaseOffset = cfg.moonSpeed > 0 ? rng.range(0, Math.PI * 2) : 0;

  // 패턴을 seed로 고른다. 게임 도중 한 번 다른 패턴으로 바뀐다.
  const pattern = cfg.chaotic ? pickPattern(rng) : "wave";
  let nextPattern = pattern;
  if (cfg.chaotic) {
    // 같은 패턴이 연속되지 않게 다른 것을 고른다
    do {
      nextPattern = pickPattern(rng);
    } while (nextPattern === pattern && MOON_PATTERNS.length > 1);
  }
  // 조준하는 사이에 패턴이 바뀌도록 이른 시점에 전환한다
  const switchTick = cfg.chaotic ? rng.int(90, 220) : Number.MAX_SAFE_INTEGER;

  let wanderTrack: number[] | null = null;
  if (cfg.chaotic) {
    // 시안의 누적 표류를 tick별 배열로 미리 계산한다.
    // 누적 방식이라 tick마다 즉석 계산이 불가능하므로 사전 계산이 필요하다.
    wanderTrack = new Array<number>(WANDER_TRACK_LENGTH);
    let wander = 0;
    for (let i = 0; i < WANDER_TRACK_LENGTH; i++) {
      wander += (rng.next() - 0.5) * 2 * WANDER.step;
      wander = clamp(wander, -cfg.wanderLimit, cfg.wanderLimit);
      wanderTrack[i] = wander;
    }
  }

  return {
    round,
    phaseOffset,
    wanderTrack,
    pattern,
    switchTick,
    nextPattern,
  };
}

/**
 * 주어진 tick에서의 달 위치를 계산한다.
 *
 * 결과는 항상 화면 안으로 제한된다 (요구사항 8.8).
 */
export function moonPosition(state: MoonPathState, tick: number): Vec2 {
  const cfg = getRoundConfig(state.round);

  // 라운드 1: 화면 상단 중앙에 고정 (요구사항 8.3)
  if (cfg.moonSpeed === 0) {
    return { x: 0.5, y: MOON.baseY };
  }

  const phase = state.phaseOffset + tick * MOON_PHASE_STEP * cfg.moonSpeed;

  let offset: Vec2;
  if (cfg.chaotic) {
    // 전환 시점을 지나면 다른 패턴으로 바뀐다.
    // 경계에서 위치가 튀지 않도록 짧은 구간에 걸쳐 섞는다.
    const BLEND = 30;
    const d = tick - state.switchTick;
    if (d <= 0) {
      offset = chaoticOffset(phase, state.pattern);
    } else if (d >= BLEND) {
      offset = chaoticOffset(phase, state.nextPattern);
    } else {
      const a = chaoticOffset(phase, state.pattern);
      const b = chaoticOffset(phase, state.nextPattern);
      const t = d / BLEND;
      offset = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  } else {
    offset = smoothOffset(phase);
  }

  const wander = state.wanderTrack
    ? state.wanderTrack[tick % state.wanderTrack.length]
    : 0;

  const x = 0.5 + wander + offset.x * cfg.amplitudeX;
  const y = MOON.baseY + offset.y * cfg.amplitudeY;

  // 화면 밖으로 나가지 않게 제한 (요구사항 8.8).
  // 라운드마다 달 크기가 다르므로 해당 라운드의 반지름을 기준으로 한다.
  const r = moonRadius(state.round);
  return {
    x: clamp(x, r, 1 - r),
    y: clamp(y, MOON.minY, MOON.maxY),
  };
}

/**
 * 라운드 2: 좌우 왕복과 완만한 상하 움직임 (요구사항 8.4)
 * 시안: sin(tPhase), sin(tPhase * 1.7)
 */
function smoothOffset(phase: number): Vec2 {
  return {
    x: Math.sin(phase),
    y: Math.sin(phase * 1.7),
  };
}

/**
 * 라운드 3 궤적 패턴. (요구사항 8.5)
 *
 * 매 판마다 seed로 패턴 하나를 고른다. 같은 패턴 안에서도 위상 시작점이
 * 달라지므로 "이 게임은 이렇게 움직인다"를 외울 수 없다.
 *
 * ⚠️ 라운드 3은 의도적으로 어렵게 설계됐다 (요구사항 8.18).
 *    패턴을 단순하게 바꾸거나 개수를 줄이지 말 것.
 */
export type MoonPattern =
  | "wave" // 파동 중첩: 불규칙하게 흐르는 물결
  | "figure8" // 8자: 좌우로 가면서 위아래가 두 배 빠르게
  | "zigzag" // 지그재그: 각진 왕복
  | "orbit" // 원형 궤도: 빙 돌기
  | "dart" // 급정지·급출발: 한쪽에 머물다 튀어나감
  | "bounce"; // 튕김: 벽에 닿으면 반사

const PATTERNS: readonly MoonPattern[] = [
  "wave",
  "figure8",
  "zigzag",
  "orbit",
  "dart",
  "bounce",
];

/** 삼각파. -1~1 사이를 직선으로 왕복해 각진 움직임을 만든다. */
function triangle(t: number): number {
  const p = ((t / (Math.PI * 2)) % 1 + 1) % 1;
  return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
}

/**
 * 패턴별 오프셋. 결과는 -1~1 범위를 목표로 한다.
 * 실제 이동량은 라운드 설정의 진폭이 곱해진다.
 */
function chaoticOffset(phase: number, pattern: MoonPattern): Vec2 {
  switch (pattern) {
    case "wave":
      // 시안 원본. 파동 3개를 겹쳐 흐르는 듯한 불규칙 궤적
      return {
        x:
          Math.sin(phase) * 0.6 +
          Math.sin(phase * 2.3 + 1.7) * 0.28 +
          Math.sin(phase * 0.53) * 0.12,
        y: Math.sin(phase * 1.7) * 0.55 + Math.cos(phase * 3.1 + 0.4) * 0.45,
      };

    case "figure8":
      // 8자. 세로가 가로의 두 배 주기라 교차점에서 방향이 급변한다
      return {
        x: Math.sin(phase),
        y: Math.sin(phase * 2) * 0.9,
      };

    case "zigzag":
      // 삼각파로 각진 왕복. 꺾이는 순간을 예측하기 어렵다
      return {
        x: triangle(phase),
        y: triangle(phase * 1.6 + 1.1) * 0.8,
      };

    case "orbit":
      // 원형 궤도에 살짝 흔들림을 더한다
      return {
        x: Math.cos(phase) + Math.sin(phase * 3.7) * 0.12,
        y: Math.sin(phase) * 0.85 + Math.cos(phase * 4.1) * 0.1,
      };

    case "dart": {
      /*
       * 급정지·급출발. 양 끝에 머무는 시간을 늘려 "머물다 튀어나가는" 느낌을 준다.
       *
       * 처음에는 abs(sin)^0.35를 썼는데, 중앙 통과 시 기울기가 무한에 가까워
       * 달이 화면을 순간이동했다. tanh는 양 끝을 평평하게 만들면서도
       * 중앙에서의 기울기가 유한하다.
       */
      const K = 2.0;
      const norm = Math.tanh(K);
      return {
        x: Math.tanh(K * Math.sin(phase)) / norm,
        y: Math.sin(phase * 2.6) * 0.7,
      };
    }

    case "bounce": {
      // 벽 튕김. 등속으로 가다 경계에서 반사되어 방향이 갑자기 바뀐다
      return {
        x: triangle(phase * 0.85),
        y: Math.abs(Math.sin(phase * 1.9)) * 1.5 - 0.75,
      };
    }
  }
}

/** seed로 패턴을 고른다. */
export function pickPattern(rng: { int(min: number, max: number): number }) {
  return PATTERNS[rng.int(0, PATTERNS.length - 1)];
}

/** 패턴 목록을 노출해 테스트에서 전수 검증할 수 있게 한다. */
export const MOON_PATTERNS = PATTERNS;

/** 라운드 설정을 그대로 다시 노출해 호출부가 config를 따로 import하지 않게 한다. */
export function moonRoundConfig(round: number): RoundConfig {
  return getRoundConfig(round);
}
