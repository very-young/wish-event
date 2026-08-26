import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  CANONICAL_VIEWPORT,
  simulate,
  verifyResult,
  type InputLog,
} from "./replay";
import { initObstacles, obstaclesAtTick, stepObstacles } from "./obstacles";
import { PHYSICS, TOTAL_ROUNDS, getRoundConfig } from "./config";

const seedArb = fc.integer({ min: 0, max: 0xffffffff });
const seedsArb = fc.array(seedArb, {
  minLength: TOTAL_ROUNDS,
  maxLength: TOTAL_ROUNDS,
});

const shotArb = fc.record({
  tick: fc.integer({ min: 0, max: 500 }),
  angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  power: fc.double({ min: 0, max: PHYSICS.maxPull, noNaN: true }),
});

/** 규칙에 맞는 입력 로그 생성기 */
const validLogArb: fc.Arbitrary<InputLog> = fc
  .tuple(
    fc.array(shotArb, { minLength: 1, maxLength: 6 }),
    fc.array(shotArb, { minLength: 1, maxLength: 1 }),
    fc.array(shotArb, { minLength: 1, maxLength: 1 }),
  )
  .map(([r1, r2, r3]) => ({
    rounds: [
      // 라운드 1은 여러 발 가능하므로 tick을 증가 순으로 정렬
      {
        round: 1,
        shots: r1
          .map((s, i) => ({ ...s, tick: i * 100 + (s.tick % 50) }))
          .sort((a, b) => a.tick - b.tick),
      },
      { round: 2, shots: r2 },
      { round: 3, shots: r3 },
    ],
  }));

describe("Property 16: 시뮬레이션 결정론성", () => {
  it("같은 seed와 입력 로그는 항상 같은 결과를 낸다", () => {
    fc.assert(
      fc.property(seedsArb, validLogArb, (seeds, log) => {
        const a = simulate(seeds, log, CANONICAL_VIEWPORT);
        const b = simulate(seeds, log, CANONICAL_VIEWPORT);
        expect(a).toEqual(b);
      }),
      { numRuns: 60 },
    );
  });

  it("여러 번 반복해도 결과가 변하지 않는다", () => {
    fc.assert(
      fc.property(seedsArb, validLogArb, (seeds, log) => {
        const first = simulate(seeds, log, CANONICAL_VIEWPORT);
        for (let i = 0; i < 3; i++) {
          expect(simulate(seeds, log, CANONICAL_VIEWPORT)).toEqual(first);
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe("Property 17: 클라이언트·서버 판정 일치", () => {
  it("서버 검증 진입점이 고정 화면 크기로 같은 결과를 낸다", () => {
    fc.assert(
      fc.property(seedsArb, validLogArb, (seeds, log) => {
        expect(verifyResult(seeds, log)).toEqual(
          simulate(seeds, log, CANONICAL_VIEWPORT),
        );
      }),
      { numRuns: 60 },
    );
  });
});

describe("Property 18: 라운드 1 무제한 재시도", () => {
  it("라운드 1은 발사 횟수 제한이 없다", () => {
    expect(getRoundConfig(1).shotsAllowed).toBeNull();
  });

  it("라운드 1에서 여러 번 빗나가도 검증이 거부되지 않는다", () => {
    fc.assert(
      fc.property(
        seedsArb,
        fc.integer({ min: 2, max: 40 }),
        (seeds, shotCount) => {
          // 확실히 빗나가는 조준: 아주 약한 세기로 여러 번
          const log: InputLog = {
            rounds: [
              {
                round: 1,
                shots: Array.from({ length: shotCount }, (_, i) => ({
                  tick: i * 60,
                  angle: Math.PI / 2, // 아래로 발사 → 즉시 화면 밖
                  power: PHYSICS.maxPull,
                })),
              },
            ],
          };
          const result = simulate(seeds, log, CANONICAL_VIEWPORT);
          // 횟수 초과로 무효 처리되지 않아야 한다
          expect(result.invalidReason).toBeUndefined();
          expect(result.reachedRound).toBe(1);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("Property 19: 라운드 2·3 단발 판정", () => {
  it("라운드 2와 3은 발사 기회가 1회다", () => {
    expect(getRoundConfig(2).shotsAllowed).toBe(1);
    expect(getRoundConfig(3).shotsAllowed).toBe(1);
  });

  it("라운드 2에 2발 이상 기록된 로그는 무효 처리된다", () => {
    fc.assert(
      fc.property(seedsArb, fc.integer({ min: 2, max: 5 }), (seeds, n) => {
        const log: InputLog = {
          rounds: [
            {
              round: 1,
              shots: [{ tick: 0, angle: -Math.PI / 2, power: PHYSICS.maxPull }],
            },
            {
              round: 2,
              shots: Array.from({ length: n }, (_, i) => ({
                tick: i * 60,
                angle: -Math.PI / 2,
                power: PHYSICS.maxPull,
              })),
            },
          ],
        };
        const result = simulate(seeds, log, CANONICAL_VIEWPORT);
        if (result.reachedRound === 2) {
          expect(result.invalidReason).toBeDefined();
          expect(result.success).toBe(false);
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe("조작 시도 방어", () => {
  it("발사 기록이 없으면 성공으로 판정되지 않는다", () => {
    fc.assert(
      fc.property(seedsArb, (seeds) => {
        const result = simulate(seeds, { rounds: [] }, CANONICAL_VIEWPORT);
        expect(result.success).toBe(false);
        expect(result.reachedRound).toBe(1);
      }),
    );
  });

  it("빈 발사 배열은 성공으로 판정되지 않는다", () => {
    fc.assert(
      fc.property(seedsArb, (seeds) => {
        const log: InputLog = {
          rounds: [
            { round: 1, shots: [] },
            { round: 2, shots: [] },
            { round: 3, shots: [] },
          ],
        };
        expect(simulate(seeds, log, CANONICAL_VIEWPORT).success).toBe(false);
      }),
    );
  });

  it("유한하지 않은 조준값은 무효 처리된다", () => {
    fc.assert(
      fc.property(
        seedsArb,
        fc.constantFrom(
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        ),
        (seeds, bad) => {
          const log: InputLog = {
            rounds: [{ round: 1, shots: [{ tick: 0, angle: bad, power: 1 }] }],
          };
          const result = simulate(seeds, log, CANONICAL_VIEWPORT);
          expect(result.invalidReason).toBeDefined();
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it("음수 tick은 무효 처리된다", () => {
    fc.assert(
      fc.property(seedsArb, fc.integer({ min: -1000, max: -1 }), (seeds, t) => {
        const log: InputLog = {
          rounds: [
            {
              round: 1,
              shots: [{ tick: t, angle: -Math.PI / 2, power: 0.3 }],
            },
          ],
        };
        const result = simulate(seeds, log, CANONICAL_VIEWPORT);
        expect(result.invalidReason).toBeDefined();
      }),
    );
  });

  it("seed 개수가 부족하면 무효 처리된다", () => {
    fc.assert(
      fc.property(
        fc.array(seedArb, { minLength: 0, maxLength: TOTAL_ROUNDS - 1 }),
        validLogArb,
        (seeds, log) => {
          const result = simulate(seeds, log, CANONICAL_VIEWPORT);
          expect(result.invalidReason).toBeDefined();
          expect(result.success).toBe(false);
        },
      ),
    );
  });

  it("라운드 1의 발사 시점이 뒤엉키면 무효 처리된다", () => {
    fc.assert(
      fc.property(seedsArb, (seeds) => {
        const log: InputLog = {
          rounds: [
            {
              round: 1,
              shots: [
                { tick: 100, angle: -Math.PI / 2, power: 0.3 },
                { tick: 50, angle: -Math.PI / 2, power: 0.3 },
              ],
            },
          ],
        };
        const result = simulate(seeds, log, CANONICAL_VIEWPORT);
        expect(result.invalidReason).toBeDefined();
      }),
    );
  });
});

describe("장애물 결정론성", () => {
  it("같은 seed는 같은 초기 배치를 만든다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(initObstacles(3, seed)).toEqual(initObstacles(3, seed));
      }),
    );
  });

  it("라운드 1·2에는 장애물이 없다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(initObstacles(1, seed)).toHaveLength(0);
        expect(initObstacles(2, seed)).toHaveLength(0);
      }),
    );
  });

  it("라운드 3에는 구름 3개와 제트기 1대가 있다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const obs = initObstacles(3, seed);
        expect(obs.filter((o) => o.kind === "cloud")).toHaveLength(3);
        expect(obs.filter((o) => o.kind === "jet")).toHaveLength(1);
      }),
    );
  });

  it("tick 직접 계산이 반복 이동과 같은 결과를 낸다", () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 0, max: 300 }), (seed, tick) => {
        let stepped = initObstacles(3, seed);
        for (let i = 0; i < tick; i++) stepped = stepObstacles(stepped);
        expect(obstaclesAtTick(3, seed, tick)).toEqual(stepped);
      }),
    );
  });

  it("장애물이 화면을 벗어나면 반대편에서 재등장한다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        let obs = initObstacles(3, seed);
        // 충분히 오래 진행해도 좌표가 발산하지 않는다
        for (let i = 0; i < 5000; i++) obs = stepObstacles(obs);
        for (const o of obs) {
          expect(o.pos.x).toBeGreaterThan(-1);
          expect(o.pos.x).toBeLessThan(2);
        }
      }),
      { numRuns: 30 },
    );
  });
});
