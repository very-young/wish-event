import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  MAX_LAUNCH_SPEED,
  computeAim,
  evaluateStep,
  isOutOfBounds,
  launchPlane,
  launchSpeedScaled,
  normalizeAngle,
  predictTrajectory,
  shouldCancelLaunch,
  stepPlane,
  type Aim,
} from "./physics";
import { PHYSICS } from "./config";
import type { Viewport } from "./coords";

const viewportArb = fc.record({
  width: fc.integer({ min: 240, max: 3840 }),
  height: fc.integer({ min: 320, max: 2160 }),
});

const pointArb = fc.record({
  x: fc.double({ min: -0.5, max: 1.5, noNaN: true }),
  y: fc.double({ min: -0.5, max: 1.5, noNaN: true }),
});

const aimArb = fc.record({
  angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  power: fc.double({ min: 0, max: 5, noNaN: true }),
});

describe("Property 12: 발사 속도 상한", () => {
  it("임의의 당김 입력에서도 조준 세기가 상한을 넘지 않는다", () => {
    fc.assert(
      fc.property(viewportArb, pointArb, pointArb, (vp, from, to) => {
        const aim = computeAim(from, to, vp);
        expect(aim.power).toBeLessThanOrEqual(PHYSICS.maxPull);
      }),
    );
  });

  it("임의의 조준값에서도 발사 속력이 상한을 넘지 않는다", () => {
    fc.assert(
      fc.property(aimArb, (aim: Aim) => {
        expect(launchSpeedScaled(aim)).toBeLessThanOrEqual(
          MAX_LAUNCH_SPEED + 1e-12,
        );
      }),
    );
  });

  it("당김을 아무리 크게 해도 속력이 더 늘지 않는다", () => {
    fc.assert(
      fc.property(
        fc.double({ min: PHYSICS.maxPull, max: 100, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (power, angle) => {
          expect(launchSpeedScaled({ angle, power })).toBeCloseTo(
            MAX_LAUNCH_SPEED,
            12,
          );
        },
      ),
    );
  });

  it("조준값과 좌표가 항상 유한하다", () => {
    fc.assert(
      fc.property(viewportArb, pointArb, pointArb, (vp, from, to) => {
        const aim = computeAim(from, to, vp);
        expect(Number.isFinite(aim.angle)).toBe(true);
        expect(Number.isFinite(aim.power)).toBe(true);
      }),
    );
  });
});

describe("Property 21: 궤적 예측 정확성", () => {
  it("예측 궤적의 각 지점이 실제 비행 경로와 일치한다", () => {
    fc.assert(
      fc.property(
        viewportArb,
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: PHYSICS.minPull, max: PHYSICS.maxPull, noNaN: true }),
        fc.integer({ min: 1, max: 40 }),
        (vp: Viewport, angle, power, steps) => {
          const aim = { angle, power };
          const predicted = predictTrajectory(aim, vp, steps);

          let plane = launchPlane(aim, vp);
          const actual = [];
          for (let i = 0; i < steps; i++) {
            plane = stepPlane(plane, vp);
            actual.push({ ...plane.pos });
          }

          expect(predicted).toEqual(actual);
        },
      ),
    );
  });
});

describe("발사 취소 규칙", () => {
  it("최소 기준 미달이면 발사가 취소된다", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: PHYSICS.minPull, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (power, angle) => {
          fc.pre(power < PHYSICS.minPull);
          expect(shouldCancelLaunch({ angle, power })).toBe(true);
        },
      ),
    );
  });

  it("최소 기준 이상이면 발사가 취소되지 않는다", () => {
    fc.assert(
      fc.property(
        fc.double({ min: PHYSICS.minPull, max: PHYSICS.maxPull, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (power, angle) => {
          expect(shouldCancelLaunch({ angle, power })).toBe(false);
        },
      ),
    );
  });

  it("당김이 전혀 없으면 발사가 취소된다", () => {
    fc.assert(
      fc.property(viewportArb, pointArb, (vp, p) => {
        expect(shouldCancelLaunch(computeAim(p, p, vp))).toBe(true);
      }),
    );
  });
});

describe("발사 방향", () => {
  it("발사 방향은 당김의 반대다", () => {
    const vp = { width: 420, height: 420 };
    // 아래로 당기면 위로 날아가야 한다
    const aim = computeAim({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 }, vp);
    expect(Math.sin(aim.angle)).toBeLessThan(0);

    // 왼쪽으로 당기면 오른쪽으로 날아가야 한다
    const aim2 = computeAim({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.5 }, vp);
    expect(Math.cos(aim2.angle)).toBeGreaterThan(0);
  });
});

describe("중력 적용", () => {
  it("비행 중 세로 속도가 계속 증가한다", () => {
    fc.assert(
      fc.property(
        viewportArb,
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (vp, angle) => {
          let plane = launchPlane({ angle, power: PHYSICS.maxPull }, vp);
          let prev = plane.vel.y;
          for (let i = 0; i < 20; i++) {
            plane = stepPlane(plane, vp);
            expect(plane.vel.y).toBeGreaterThan(prev);
            prev = plane.vel.y;
          }
        },
      ),
    );
  });

  it("위로 발사한 비행기는 결국 아래로 떨어진다", () => {
    const vp = { width: 420, height: 920 };
    let plane = launchPlane(
      { angle: -Math.PI / 2, power: PHYSICS.maxPull },
      vp,
    );
    for (let i = 0; i < 2000; i++) {
      plane = stepPlane(plane, vp);
      if (isOutOfBounds(plane)) break;
    }
    expect(isOutOfBounds(plane)).toBe(true);
  });
});

describe("각도 정규화", () => {
  it("결과가 항상 -π ~ π 범위 안이다", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        (angle) => {
          const n = normalizeAngle(angle);
          expect(n).toBeGreaterThanOrEqual(-Math.PI);
          expect(n).toBeLessThanOrEqual(Math.PI);
        },
      ),
    );
  });
});

describe("장애물 종류별 판정 (요구사항 8.14)", () => {
  it("구름과 제트기를 구분해 알려준다", () => {
    const vp = { width: 420, height: 920 };
    const plane = {
      pos: { x: 0.5, y: 0.3 },
      vel: { x: 0, y: 0 },
      angle: 0,
      launched: true,
    };

    const cloud = {
      kind: "cloud" as const,
      pos: { x: 0.5, y: 0.3 },
      vx: 0,
      radius: 0.1,
    };
    const jet = {
      kind: "jet" as const,
      pos: { x: 0.5, y: 0.3 },
      vx: 0,
      radius: 0.1,
    };

    // 달은 멀리 두어 명중이 아니게 한다
    const farMoon = { x: 0.05, y: 0.05 };

    const cloudResult = evaluateStep(plane, farMoon, 0.01, [cloud], vp);
    expect(cloudResult).toEqual({ type: "blocked", by: "cloud" });

    const jetResult = evaluateStep(plane, farMoon, 0.01, [jet], vp);
    expect(jetResult).toEqual({ type: "blocked", by: "jet" });
  });

  it("달 명중이 장애물 충돌보다 우선한다", () => {
    const vp = { width: 420, height: 920 };
    const plane = {
      pos: { x: 0.5, y: 0.3 },
      vel: { x: 0, y: 0 },
      angle: 0,
      launched: true,
    };
    const cloud = {
      kind: "cloud" as const,
      pos: { x: 0.5, y: 0.3 },
      vx: 0,
      radius: 0.1,
    };
    // 달과 장애물이 같은 위치에 겹쳐 있으면 명중을 우선한다
    const result = evaluateStep(plane, { x: 0.5, y: 0.3 }, 0.08, [cloud], vp);
    expect(result.type).toBe("hit");
  });
});
