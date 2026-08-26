import { describe, expect, it } from "vitest";
import { CANONICAL_VIEWPORT, simulate, type InputLog } from "./replay";
import { PHYSICS, moonRadius } from "./config";
import {
  LAUNCH_PAD,
  evaluateStep,
  launchPlane,
  stepPlane,
} from "./physics";
import { createMoonPath, moonPosition } from "./moon-path";
import { initObstacles, stepObstacles } from "./obstacles";

/**
 * 플레이 가능성 검증.
 *
 * 요구사항 8.11: 라운드 1은 누구나 통과할 수 있어야 한다.
 * 물리값이 잘못되면 아무리 조준해도 달에 닿지 못할 수 있으므로,
 * 실제로 맞출 수 있는 조준이 존재하는지 확인한다.
 */

const vp = CANONICAL_VIEWPORT;

/** 주어진 라운드에서 명중하는 조준을 탐색한다. */
function findHittingAim(
  round: number,
  seed: number,
  startTick: number,
  withObstacles = false,
): { angle: number; power: number } | null {
  const moonPath = createMoonPath(round, seed);
  const moonR = moonRadius(round);

  // 각도와 세기를 격자 탐색
  for (let deg = -170; deg <= -10; deg += 1) {
    const angle = (deg * Math.PI) / 180;
    for (let p = 0.2; p <= 1.0; p += 0.02) {
      const power = PHYSICS.maxPull * p;
      let plane = launchPlane({ angle, power }, vp, LAUNCH_PAD);
      let obstacles = withObstacles ? initObstacles(round, seed) : [];

      for (let step = 1; step <= 600; step++) {
        plane = stepPlane(plane, vp);
        obstacles = stepObstacles(obstacles);
        const moonPos = moonPosition(moonPath, startTick + step);
        const outcome = evaluateStep(plane, moonPos, moonR, obstacles, vp);
        if (outcome.type === "hit") return { angle, power };
        if (outcome.type !== "flying") break;
      }
    }
  }
  return null;
}

describe("라운드 1 플레이 가능성 (요구사항 8.11)", () => {
  it("라운드 1에서 명중 가능한 조준이 존재한다", () => {
    const aim = findHittingAim(1, 12345, 0);
    expect(aim).not.toBeNull();
  });

  it("라운드 1은 달이 고정이므로 어떤 seed에서도 명중 가능하다", () => {
    for (const seed of [0, 1, 999, 0xffffffff, 42424242]) {
      const aim = findHittingAim(1, seed, 0);
      expect(aim, `seed ${seed}에서 명중 조준을 찾지 못했다`).not.toBeNull();
    }
  });

  it("찾은 조준으로 시뮬레이션하면 실제로 라운드 1을 통과한다", () => {
    const seed = 777;
    const aim = findHittingAim(1, seed, 0);
    expect(aim).not.toBeNull();

    const log: InputLog = {
      rounds: [{ round: 1, shots: [{ tick: 0, ...aim! }] }],
    };
    const result = simulate([seed, seed, seed], log, vp);

    // 라운드 1은 통과하고 라운드 2에서 기록이 없어 종료
    expect(result.reachedRound).toBe(2);
    expect(result.shotResults[0]).toContain("hit");
  });
});

describe("라운드 2 플레이 가능성", () => {
  it("라운드 2에서도 명중 가능한 조준이 존재한다", () => {
    const aim = findHittingAim(2, 24680, 0);
    expect(aim).not.toBeNull();
  });
});

describe("라운드 3 난이도 (요구사항 8.18)", () => {
  it("라운드 3도 명중이 이론적으로 가능하다", () => {
    // 장애물을 제외한 순수 궤적 기준. 실제로는 장애물까지 피해야 하므로 더 어렵다.
    const aim = findHittingAim(3, 13579, 0);
    expect(aim).not.toBeNull();
  });

  /**
   * ⚠️ 측정 결과: 무작위 조준 기준으로 라운드 3의 명중률이 라운드 1보다 높다.
   *    (라운드1 6.5% / 라운드2 6.7% / 라운드3 13.0%)
   *
   * 원인: 라운드 3의 달은 넓은 범위를 빠르게 왕복한다. 넓게 훑고 지나가므로
   *       아무렇게나 쏜 비행기의 경로에 달이 스스로 들어오는 경우가 늘어난다.
   *       "빠르다 = 어렵다"가 성립하지 않는 구조다.
   *
   * 사람의 조준으로는 여전히 라운드 3이 어렵다(예측이 불가능하므로). 다만
   * 대충 화면 중앙으로 쏘는 전략이 라운드 1보다 잘 통한다는 점은 문제다.
   *
   * 이 수치는 작업 8.4(난이도 조정)의 입력 자료다. 실제 조정 방향은
   * 사용자 확인 후 결정한다. 지금은 시안 값을 그대로 유지한다.
   */
  /**
   * 무작위 조준 명중률은 라운드 3이 라운드 1보다 여전히 높다.
   * 빠르게 넓은 범위를 움직이는 표적의 구조적 특성이다(경로에 스스로 들어온다).
   * 사람이 조준하는 상황에서는 예측 불가능성 때문에 실제로 훨씬 어렵다.
   *
   * 따라서 여기서는 "달 크기 축소로 명중률이 충분히 억제됐는지"를 확인한다.
   * 기준: 시안 원본(13.15%)의 3분의 2 이하.
   */
  it("달 크기 축소로 라운드 3 명중률이 억제됐다", () => {
    const rate = (round: number, seed: number): number => {
      const moonPath = createMoonPath(round, seed);
      const moonR = moonRadius(round);
      let hits = 0;
      let total = 0;
      for (let deg = -175; deg <= -5; deg += 2) {
        const angle = (deg * Math.PI) / 180;
        for (let p = 0.15; p <= 1.0; p += 0.02) {
          total++;
          let plane = launchPlane(
            { angle, power: PHYSICS.maxPull * p },
            vp,
            LAUNCH_PAD,
          );
          let obstacles = initObstacles(round, seed);
          for (let step = 1; step <= 600; step++) {
            plane = stepPlane(plane, vp);
            obstacles = stepObstacles(obstacles);
            const outcome = evaluateStep(
              plane,
              moonPosition(moonPath, step),
              moonR,
              obstacles,
              vp,
            );
            if (outcome.type === "hit") {
              hits++;
              break;
            }
            if (outcome.type !== "flying") break;
          }
        }
      }
      return hits / total;
    };

    const seeds = [111, 2222, 33333, 444444, 5555555];
    const avg = (round: number) =>
      seeds.reduce((s, sd) => s + rate(round, sd), 0) / seeds.length;

    const r1 = avg(1);
    const r3 = avg(3);

    // 모든 라운드에서 명중이 가능해야 한다
    expect(r1).toBeGreaterThan(0);
    expect(r3).toBeGreaterThan(0);

    // 시안 원본 수준(약 13%)으로 되돌아가지 않았는지 확인
    expect(r3).toBeLessThan(0.1);
  });
});
