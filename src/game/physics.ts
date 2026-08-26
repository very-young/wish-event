/**
 * 발사 물리와 충돌 판정. (요구사항 7.3, 7.5~7.8, 8.14, 8.15)
 *
 * 전부 순수 함수다. 서버가 같은 함수로 결과를 재현하기 때문에
 * 시간·난수·전역 상태에 의존하지 않는다.
 */

import { OBSTACLE, PHYSICS, PLANE } from "./config";
import { distanceScaled, type Vec2, type Viewport } from "./coords";

/** 발사 조준값. 키보드와 포인터 입력이 모두 이 형태로 변환된다. */
export interface Aim {
  /** 발사 방향(라디안). 화면 좌표계 기준이라 위쪽이 음수 y. */
  angle: number;
  /** 당김 거리. 0 이상 PHYSICS.maxPull 이하로 정규화된 값. */
  power: number;
}

/** 비행기 상태 */
export interface PlaneState {
  pos: Vec2;
  /** 속도 (가상 단위 / step) */
  vel: Vec2;
  /** 진행 방향(라디안) */
  angle: number;
  launched: boolean;
}

export type Obstacle = {
  kind: "cloud" | "jet";
  pos: Vec2;
  /** 가로 속도 (가상 x단위 / step) */
  vx: number;
  /** 반지름 (scaleBase 대비 비율) */
  radius: number;
};

/** 발사대 위치 */
export const LAUNCH_PAD: Vec2 = { x: PLANE.padX, y: PLANE.padY };

/** 발사대에 놓인 초기 상태의 비행기 */
export function createPlane(): PlaneState {
  return {
    pos: { ...LAUNCH_PAD },
    vel: { x: 0, y: 0 },
    angle: -Math.PI / 2,
    launched: false,
  };
}

/**
 * 당김 벡터로 조준값을 만든다.
 *
 * 새총 방식이라 발사 방향은 당김의 반대다 (요구사항 7.4).
 * 당김 거리는 최대치로 제한한다 (요구사항 7.7).
 *
 * @param pullFrom 발사대 위치 (가상 좌표)
 * @param pullTo 현재 포인터 위치 (가상 좌표)
 */
export function computeAim(
  pullFrom: Vec2,
  pullTo: Vec2,
  vp: Viewport,
): Aim {
  // 화면 비율을 반영해야 대각선 당김이 왜곡되지 않는다.
  const base = Math.min(vp.width, vp.height);
  const dx = ((pullFrom.x - pullTo.x) * vp.width) / base;
  const dy = ((pullFrom.y - pullTo.y) * vp.height) / base;

  const raw = Math.hypot(dx, dy);
  const power = Math.min(raw, PHYSICS.maxPull);
  // 당김이 0이면 방향이 없으므로 기본값(위쪽)을 준다.
  const angle = raw === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);

  return { angle, power };
}

/** 당김이 너무 짧으면 발사를 취소한다 (요구사항 7.6). */
export function shouldCancelLaunch(aim: Aim): boolean {
  return aim.power < PHYSICS.minPull;
}

/**
 * 조준값으로 발사 속도를 계산한다 (요구사항 7.5).
 *
 * 속도는 항상 상한 이하다 (Property 13):
 *   |vel| <= PHYSICS.maxPull * PHYSICS.speedFactor
 */
export function computeLaunchVelocity(aim: Aim, vp: Viewport): Vec2 {
  const speed = Math.min(aim.power, PHYSICS.maxPull) * PHYSICS.speedFactor;
  const base = Math.min(vp.width, vp.height);
  // 조준값은 scaleBase 기준이므로 가상 좌표계로 되돌린다.
  return {
    x: (Math.cos(aim.angle) * speed * base) / vp.width,
    y: (Math.sin(aim.angle) * speed * base) / vp.height,
  };
}

/** 발사 속도의 상한 (scaleBase 기준). Property 13 검증에 사용. */
export const MAX_LAUNCH_SPEED = PHYSICS.maxPull * PHYSICS.speedFactor;

/** 조준값을 scaleBase 기준 속력으로 변환. 상한 검증용. */
export function launchSpeedScaled(aim: Aim): number {
  return Math.min(aim.power, PHYSICS.maxPull) * PHYSICS.speedFactor;
}

/** 조준 중 비행기가 발사대에서 뒤로 밀린 위치 (요구사항 7.3) */
export function aimingPlanePosition(
  pullFrom: Vec2,
  pullTo: Vec2,
): Vec2 {
  const dx = pullFrom.x - pullTo.x;
  const dy = pullFrom.y - pullTo.y;
  return {
    x: pullFrom.x - dx * PHYSICS.aimDrawback,
    y: pullFrom.y - dy * PHYSICS.aimDrawback,
  };
}

/** 발사 상태의 비행기를 만든다. */
export function launchPlane(
  aim: Aim,
  vp: Viewport,
  from: Vec2 = LAUNCH_PAD,
): PlaneState {
  const vel = computeLaunchVelocity(aim, vp);
  return {
    pos: { ...from },
    vel,
    angle: Math.atan2(vel.y * vp.height, vel.x * vp.width),
    launched: true,
  };
}

/**
 * 비행기를 한 스텝 진행한다 (요구사항 7.8).
 *
 * 중력은 가상 y단위로 적용한다. 고정 타임스텝이므로 프레임 속도와 무관하다.
 */
export function stepPlane(plane: PlaneState, vp: Viewport): PlaneState {
  const vy = plane.vel.y + PHYSICS.gravity;
  const pos = { x: plane.pos.x + plane.vel.x, y: plane.pos.y + vy };
  return {
    pos,
    vel: { x: plane.vel.x, y: vy },
    angle: Math.atan2(vy * vp.height, plane.vel.x * vp.width),
    launched: true,
  };
}

/**
 * 예측 궤적. 실제 비행과 동일한 식을 사용해야 예측이 어긋나지 않는다
 * (요구사항 7.3, Property 21).
 */
export function predictTrajectory(
  aim: Aim,
  vp: Viewport,
  steps: number,
  from: Vec2 = LAUNCH_PAD,
): Vec2[] {
  let plane = launchPlane(aim, vp, from);
  const points: Vec2[] = [];
  for (let i = 0; i < steps; i++) {
    plane = stepPlane(plane, vp);
    points.push({ ...plane.pos });
  }
  return points;
}

/**
 * 달 명중 판정.
 *
 * 달 반지름은 라운드마다 다르므로(라운드 3은 축소) 호출부가 전달한다.
 */
export function hitsMoon(
  plane: PlaneState,
  moonPos: Vec2,
  moonR: number,
  vp: Viewport,
): boolean {
  return distanceScaled(plane.pos, moonPos, vp) < moonR + PLANE.radius;
}

/** 장애물 충돌 판정 (요구사항 8.14) */
export function hitsObstacle(
  plane: PlaneState,
  obstacles: readonly Obstacle[],
  vp: Viewport,
): boolean {
  return obstacles.some(
    (o) =>
      distanceScaled(plane.pos, o.pos, vp) <
      o.radius + PLANE.radius - OBSTACLE.collisionSlack,
  );
}

/** 화면 밖 이탈 판정 (요구사항 8.15) */
export function isOutOfBounds(plane: PlaneState): boolean {
  const m = PLANE.outOfBoundsMargin;
  return (
    plane.pos.x < -m || plane.pos.x > 1 + m || plane.pos.y > 1 + m
  );
}

/**
 * 한 스텝의 판정 결과.
 *
 * 판정 순서는 달 → 장애물 → 화면 밖이다. 달과 장애물이 겹친 순간에
 * 통과하면 명중을 우선한다. 참여자에게 유리한 쪽이 자연스럽다.
 */
export type StepOutcome =
  | { type: "flying" }
  | { type: "hit" }
  /** 어떤 장애물에 부딪혔는지 함께 알려 안내 문구를 구분한다 */
  | { type: "blocked"; by: Obstacle["kind"] }
  | { type: "out" };

export function evaluateStep(
  plane: PlaneState,
  moonPos: Vec2,
  moonR: number,
  obstacles: readonly Obstacle[],
  vp: Viewport,
): StepOutcome {
  if (hitsMoon(plane, moonPos, moonR, vp)) return { type: "hit" };
  const blocker = findBlockingObstacle(plane, obstacles, vp);
  if (blocker) return { type: "blocked", by: blocker.kind };
  if (isOutOfBounds(plane)) return { type: "out" };
  return { type: "flying" };
}

/** 부딪힌 장애물을 찾는다. 없으면 undefined. */
export function findBlockingObstacle(
  plane: PlaneState,
  obstacles: readonly Obstacle[],
  vp: Viewport,
): Obstacle | undefined {
  return obstacles.find(
    (o) =>
      distanceScaled(plane.pos, o.pos, vp) <
      o.radius + PLANE.radius - OBSTACLE.collisionSlack,
  );
}

/** 조준 각도를 정규화 (-π ~ π) */
export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
    let a = angle % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a < -Math.PI) a += twoPi;
  return a;
}


