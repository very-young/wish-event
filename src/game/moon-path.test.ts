import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MOON_PATTERNS, createMoonPath, moonPosition } from "./moon-path";
import { MOON, TOTAL_ROUNDS, moonRadius } from "./config";

const seedArb = fc.integer({ min: 0, max: 0xffffffff });
const tickArb = fc.integer({ min: 0, max: 20000 });
const roundArb = fc.integer({ min: 1, max: TOTAL_ROUNDS });

describe("Property 13: 달의 화면 내 유지", () => {
  it("임의의 tick과 라운드에서 달이 화면 안에 있다", () => {
    fc.assert(
      fc.property(roundArb, seedArb, tickArb, (round, seed, tick) => {
        const path = createMoonPath(round, seed);
        const pos = moonPosition(path, tick);
        const r = moonRadius(round);

        // 달이 화면 좌우로 잘리지 않는다
        expect(pos.x).toBeGreaterThanOrEqual(r);
        expect(pos.x).toBeLessThanOrEqual(1 - r);

        // 달이 상하 허용 범위 안에 있다
        expect(pos.y).toBeGreaterThanOrEqual(MOON.minY);
        expect(pos.y).toBeLessThanOrEqual(MOON.maxY);
      }),
    );
  });

  it("모든 좌표가 유한한 값이다", () => {
    fc.assert(
      fc.property(roundArb, seedArb, tickArb, (round, seed, tick) => {
        const path = createMoonPath(round, seed);
        const pos = moonPosition(path, tick);
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
      }),
    );
  });
});

describe("Property 15: 달 궤적의 결정론성", () => {
  it("같은 seed와 tick은 항상 같은 위치를 낸다", () => {
    fc.assert(
      fc.property(roundArb, seedArb, tickArb, (round, seed, tick) => {
        const a = moonPosition(createMoonPath(round, seed), tick);
        const b = moonPosition(createMoonPath(round, seed), tick);
        expect(a.x).toBe(b.x);
        expect(a.y).toBe(b.y);
      }),
    );
  });

  it("같은 궤적 상태를 재사용해도 같은 위치를 낸다", () => {
    fc.assert(
      fc.property(roundArb, seedArb, tickArb, (round, seed, tick) => {
        const path = createMoonPath(round, seed);
        expect(moonPosition(path, tick)).toEqual(moonPosition(path, tick));
      }),
    );
  });

  it("tick 순서를 뒤섞어 조회해도 각 tick의 위치가 동일하다", () => {
    fc.assert(
      fc.property(
        roundArb,
        seedArb,
        fc.uniqueArray(tickArb, { minLength: 2, maxLength: 20 }),
        (round, seed, ticks) => {
          const path = createMoonPath(round, seed);
          const forward = ticks.map((t) => moonPosition(path, t));
          const reversed = [...ticks]
            .reverse()
            .map((t) => moonPosition(path, t))
            .reverse();
          expect(forward).toEqual(reversed);
        },
      ),
    );
  });
});

describe("라운드별 난이도 특성", () => {
  it("라운드 1은 달이 항상 화면 상단 중앙에 고정된다", () => {
    fc.assert(
      fc.property(seedArb, tickArb, (seed, tick) => {
        const pos = moonPosition(createMoonPath(1, seed), tick);
        expect(pos.x).toBe(0.5);
        expect(pos.y).toBe(MOON.baseY);
      }),
    );
  });

  it("라운드 2는 달이 움직인다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const path = createMoonPath(2, seed);
        const positions = Array.from({ length: 200 }, (_, i) =>
          moonPosition(path, i),
        );
        const xs = new Set(positions.map((p) => p.x.toFixed(6)));
        expect(xs.size).toBeGreaterThan(1);
      }),
    );
  });

  it("라운드 3은 라운드 2보다 넓은 범위를 움직인다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const spread = (round: number) => {
          const path = createMoonPath(round, seed);
          const xs = Array.from({ length: 600 }, (_, i) =>
            moonPosition(path, i).x,
          );
          return Math.max(...xs) - Math.min(...xs);
        };
        expect(spread(3)).toBeGreaterThan(spread(2));
      }),
      { numRuns: 30 },
    );
  });

  it("라운드 3의 달이 라운드 1·2보다 작다", () => {
    expect(moonRadius(3)).toBeLessThan(moonRadius(1));
    expect(moonRadius(3)).toBeLessThan(moonRadius(2));
  });

  it("라운드 3은 seed마다 궤적이 다르다", () => {
    fc.assert(
      fc.property(seedArb, seedArb, (s1, s2) => {
        fc.pre(s1 !== s2);
        const a = createMoonPath(3, s1);
        const b = createMoonPath(3, s2);
        const differs = Array.from({ length: 100 }, (_, i) => i).some(
          (t) => moonPosition(a, t).x !== moonPosition(b, t).x,
        );
        expect(differs).toBe(true);
      }),
    );
  });
});

describe("라운드 3 궤적 패턴 다양성 (요구사항 8.5)", () => {
  it("여러 seed에서 서로 다른 패턴이 선택된다", () => {
    const patterns = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      patterns.add(createMoonPath(3, seed).pattern);
    }
    // 정의된 패턴이 모두 실제로 등장해야 한다
    expect(patterns.size).toBe(MOON_PATTERNS.length);
  });

  it("게임 도중 다른 패턴으로 전환된다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const path = createMoonPath(3, seed);
        expect(path.nextPattern).not.toBe(path.pattern);
        expect(path.switchTick).toBeGreaterThan(0);
        expect(path.switchTick).toBeLessThan(600);
      }),
    );
  });

  it("모든 패턴에서 달이 화면 안에 머문다", () => {
    const r = moonRadius(3);
    // 패턴별로 하나씩 골라 검사한다 (전수 반복은 느려서 대표 seed만 사용)
    const seen = new Set<string>();
    for (let seed = 0; seed < 400 && seen.size < MOON_PATTERNS.length; seed++) {
      const path = createMoonPath(3, seed);
      if (seen.has(path.pattern)) continue;
      seen.add(path.pattern);

      for (let tick = 0; tick < 900; tick++) {
        const pos = moonPosition(path, tick);
        expect(pos.x).toBeGreaterThanOrEqual(r);
        expect(pos.x).toBeLessThanOrEqual(1 - r);
        expect(pos.y).toBeGreaterThanOrEqual(MOON.minY);
        expect(pos.y).toBeLessThanOrEqual(MOON.maxY);
      }
    }
    expect(seen.size).toBe(MOON_PATTERNS.length);
  });

  /**
   * 달이 화면을 순간이동하면 "맞출 수 없는" 느낌을 준다.
   * 라운드 3은 빠르므로 한 스텝 이동량이 크긴 하지만, 상한은 있어야 한다.
   * 기준: 한 스텝에 화면 폭의 20%를 넘지 않는다.
   */
  it("패턴 전환 지점에서 위치가 급격히 튀지 않는다", () => {
    for (let seed = 0; seed < 120; seed++) {
      const path = createMoonPath(3, seed);
      let prev = moonPosition(path, path.switchTick - 2);
      for (let t = path.switchTick - 1; t <= path.switchTick + 40; t++) {
        const cur = moonPosition(path, t);
        const jump = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        expect(jump).toBeLessThan(0.2);
        prev = cur;
      }
    }
  });

  it("모든 패턴에서 한 스텝 이동량이 상한을 넘지 않는다", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400 && seen.size < MOON_PATTERNS.length; seed++) {
      const path = createMoonPath(3, seed);
      if (seen.has(path.pattern)) continue;
      seen.add(path.pattern);

      let prev = moonPosition(path, 0);
      for (let t = 1; t < 600; t++) {
        const cur = moonPosition(path, t);
        const jump = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        expect(
          jump,
          `패턴 ${path.pattern}에서 tick ${t}에 과도한 이동`,
        ).toBeLessThan(0.2);
        prev = cur;
      }
    }
  });

  it("패턴별로 궤적 모양이 실제로 다르다", () => {
    // 같은 위상 진행에서 패턴마다 서로 다른 좌표 수열을 낸다
    const signatures = new Map<string, string>();
    for (let seed = 0; seed < 400; seed++) {
      const path = createMoonPath(3, seed);
      if (signatures.has(path.pattern)) continue;
      // 전환 전 구간만 사용해 패턴 고유의 모양을 뽑는다
      const sig = Array.from({ length: 40 }, (_, i) =>
        moonPosition({ ...path, phaseOffset: 0 }, i).x.toFixed(4),
      ).join(",");
      signatures.set(path.pattern, sig);
    }
    const unique = new Set(signatures.values());
    expect(unique.size).toBe(signatures.size);
  });
});
