import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRng } from "./rng";

const seedArb = fc.integer({ min: 0, max: 0xffffffff });

describe("Property 15: 난수 생성의 결정론성", () => {
  it("같은 seed는 항상 같은 수열을 낸다", () => {
    fc.assert(
      fc.property(seedArb, fc.integer({ min: 1, max: 200 }), (seed, count) => {
        const a = createRng(seed);
        const b = createRng(seed);
        for (let i = 0; i < count; i++) {
          expect(a.next()).toBe(b.next());
        }
      }),
    );
  });

  it("다른 seed는 다른 수열을 낼 가능성이 높다", () => {
    fc.assert(
      fc.property(seedArb, seedArb, (s1, s2) => {
        fc.pre(s1 !== s2);
        const a = createRng(s1);
        const b = createRng(s2);
        // 20개 중 하나라도 다르면 통과. 우연히 전부 같을 확률은 무시 가능.
        const differs = Array.from({ length: 20 }).some(
          () => a.next() !== b.next(),
        );
        expect(differs).toBe(true);
      }),
    );
  });
});

describe("난수 값의 범위", () => {
  it("next()는 항상 0 이상 1 미만이다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const rng = createRng(seed);
        for (let i = 0; i < 100; i++) {
          const v = rng.next();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }),
    );
  });

  it("range()는 항상 지정한 범위 안에 있다", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.double({ min: -100, max: 0, noNaN: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        (seed, min, max) => {
          const rng = createRng(seed);
          for (let i = 0; i < 50; i++) {
            const v = rng.range(min, max);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThan(max);
          }
        },
      ),
    );
  });

  it("int()는 항상 지정한 정수 범위 안에 있다", () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.integer({ min: -50, max: 0 }),
        fc.integer({ min: 1, max: 50 }),
        (seed, min, max) => {
          const rng = createRng(seed);
          for (let i = 0; i < 50; i++) {
            const v = rng.int(min, max);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThanOrEqual(max);
          }
        },
      ),
    );
  });

  it("sign()은 항상 1 또는 -1이다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const rng = createRng(seed);
        for (let i = 0; i < 50; i++) {
          expect(Math.abs(rng.sign())).toBe(1);
        }
      }),
    );
  });
});

describe("seed 정규화", () => {
  it("seed 0도 정상 동작한다", () => {
    const rng = createRng(0);
    const v = rng.next();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("음수 seed도 정상 동작한다", () => {
    fc.assert(
      fc.property(fc.integer({ min: -0xffffffff, max: -1 }), (seed) => {
        const rng = createRng(seed);
        const v = rng.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }),
    );
  });
});

describe("난수 분포", () => {
  it("충분히 뽑으면 평균이 0.5 근처가 된다", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const rng = createRng(seed);
        let sum = 0;
        const n = 5000;
        for (let i = 0; i < n; i++) sum += rng.next();
        expect(sum / n).toBeGreaterThan(0.45);
        expect(sum / n).toBeLessThan(0.55);
      }),
      { numRuns: 20 },
    );
  });
});
