import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  clamp,
  distanceScaled,
  scaleBase,
  toPixel,
  toPixelLength,
  toVirtual,
  toVirtualLength,
  type Viewport,
} from "./coords";
import { MOON, PLANE } from "./config";

/** 현실적인 화면 크기 범위 */
const viewportArb = fc.record({
  width: fc.integer({ min: 240, max: 3840 }),
  height: fc.integer({ min: 320, max: 2160 }),
});

const virtualPointArb = fc.record({
  x: fc.double({ min: 0, max: 1, noNaN: true }),
  y: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe("Property 14: 난이도 비율 불변", () => {
  it("화면 크기가 달라도 달 반지름 / min(W,H) 비율이 일정하다", () => {
    fc.assert(
      fc.property(viewportArb, (vp: Viewport) => {
        const radiusPx = toPixelLength(MOON.radius, vp);
        const ratio = radiusPx / scaleBase(vp);
        // 부동소수점 오차만 허용
        expect(ratio).toBeCloseTo(MOON.radius, 10);
      }),
    );
  });

  it("화면 크기가 달라도 달과 비행기의 크기 비율이 일정하다", () => {
    fc.assert(
      fc.property(viewportArb, (vp: Viewport) => {
        const moonPx = toPixelLength(MOON.radius, vp);
        const planePx = toPixelLength(PLANE.radius, vp);
        expect(moonPx / planePx).toBeCloseTo(MOON.radius / PLANE.radius, 10);
      }),
    );
  });

  it("화면 크기가 달라도 최대 당김 거리와 달 반지름의 비율이 일정하다", () => {
    fc.assert(
      fc.property(viewportArb, (vp: Viewport) => {
        const pullPx = toPixelLength(0.357, vp);
        const moonPx = toPixelLength(MOON.radius, vp);
        expect(pullPx / moonPx).toBeCloseTo(0.357 / MOON.radius, 10);
      }),
    );
  });
});

describe("좌표 변환의 왕복 일관성", () => {
  it("가상 → 픽셀 → 가상 변환이 원래 값을 복원한다", () => {
    fc.assert(
      fc.property(viewportArb, virtualPointArb, (vp, point) => {
        const restored = toVirtual(toPixel(point, vp), vp);
        expect(restored.x).toBeCloseTo(point.x, 9);
        expect(restored.y).toBeCloseTo(point.y, 9);
      }),
    );
  });

  it("가상 길이 → 픽셀 → 가상 변환이 원래 값을 복원한다", () => {
    fc.assert(
      fc.property(
        viewportArb,
        fc.double({ min: 0, max: 2, noNaN: true }),
        (vp, len) => {
          expect(toVirtualLength(toPixelLength(len, vp), vp)).toBeCloseTo(
            len,
            9,
          );
        },
      ),
    );
  });
});

describe("distanceScaled", () => {
  it("같은 점의 거리는 0이다", () => {
    fc.assert(
      fc.property(viewportArb, virtualPointArb, (vp, p) => {
        expect(distanceScaled(p, p, vp)).toBe(0);
      }),
    );
  });

  it("거리는 순서에 무관하다", () => {
    fc.assert(
      fc.property(
        viewportArb,
        virtualPointArb,
        virtualPointArb,
        (vp, a, b) => {
          expect(distanceScaled(a, b, vp)).toBeCloseTo(
            distanceScaled(b, a, vp),
            10,
          );
        },
      ),
    );
  });

  it("정사각형 화면에서는 가상 거리와 비례한다", () => {
    const vp = { width: 500, height: 500 };
    fc.assert(
      fc.property(virtualPointArb, virtualPointArb, (a, b) => {
        const expected = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distanceScaled(a, b, vp)).toBeCloseTo(expected, 10);
      }),
    );
  });
});

describe("clamp", () => {
  it("결과는 항상 범위 안에 있다", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -10, max: 0, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        (v, min, max) => {
          const result = clamp(v, min, max);
          expect(result).toBeGreaterThanOrEqual(min);
          expect(result).toBeLessThanOrEqual(max);
        },
      ),
    );
  });

  it("범위 안의 값은 그대로 유지된다", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (v) => {
        expect(clamp(v, 0, 1)).toBe(v);
      }),
    );
  });
});
