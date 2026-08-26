/**
 * 가상 좌표계. (요구사항 14.3)
 *
 * 게임 내부의 모든 위치·크기는 0~1 비율로 다루고, 렌더 직전에만
 * 실제 픽셀로 환산한다. 이렇게 하면 화면 크기가 달라져도 달과 비행기의
 * 상대 비율이 유지되어 난이도가 변하지 않는다.
 *
 * 시안(wish-paperplane-prototype)은 픽셀 값을 직접 써서 큰 화면에서
 * 달이 상대적으로 작아지는 문제가 있었다. 이 모듈이 그 문제를 해소한다.
 */

/** 화면 크기 (실제 픽셀) */
export interface Viewport {
  width: number;
  height: number;
}

/** 가상 좌표 (0~1 비율) */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 반지름·거리 환산의 기준 길이.
 *
 * 가로·세로 중 작은 값을 쓴다. 화면 비율이 달라져도 원이 타원으로
 * 찌그러지지 않고, 좁은 쪽 기준이라 요소가 화면을 넘치지 않는다.
 */
export function scaleBase(vp: Viewport): number {
  return Math.min(vp.width, vp.height);
}

/** 가상 x → 실제 픽셀 x */
export function toPixelX(x: number, vp: Viewport): number {
  return x * vp.width;
}

/** 가상 y → 실제 픽셀 y */
export function toPixelY(y: number, vp: Viewport): number {
  return y * vp.height;
}

/** 가상 좌표 → 실제 픽셀 좌표 */
export function toPixel(v: Vec2, vp: Viewport): Vec2 {
  return { x: toPixelX(v.x, vp), y: toPixelY(v.y, vp) };
}

/** 가상 길이(반지름 등) → 실제 픽셀 길이 */
export function toPixelLength(len: number, vp: Viewport): number {
  return len * scaleBase(vp);
}

/** 실제 픽셀 x → 가상 x */
export function toVirtualX(px: number, vp: Viewport): number {
  return px / vp.width;
}

/** 실제 픽셀 y → 가상 y */
export function toVirtualY(py: number, vp: Viewport): number {
  return py / vp.height;
}

/** 실제 픽셀 좌표 → 가상 좌표 */
export function toVirtual(p: Vec2, vp: Viewport): Vec2 {
  return { x: toVirtualX(p.x, vp), y: toVirtualY(p.y, vp) };
}

/** 실제 픽셀 길이 → 가상 길이 */
export function toVirtualLength(px: number, vp: Viewport): number {
  return px / scaleBase(vp);
}

/**
 * 가상 좌표 공간에서의 거리.
 *
 * 주의: x는 화면 폭, y는 화면 높이로 정규화되어 축 단위가 다르다.
 * 충돌 판정처럼 실제 거리가 필요한 곳에서는 이 함수를 쓰지 말고
 * `distanceScaled`를 사용한다.
 */
export function distanceVirtual(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 화면 비율을 반영한 거리. 충돌 판정에 사용한다.
 *
 * 가상 좌표를 픽셀로 환산한 뒤 거리를 구하고, 다시 기준 길이로 나눈다.
 * 결과는 반지름과 같은 단위(scaleBase 대비 비율)라서 직접 비교할 수 있다.
 */
export function distanceScaled(a: Vec2, b: Vec2, vp: Viewport): number {
  const base = scaleBase(vp);
  const dx = ((a.x - b.x) * vp.width) / base;
  const dy = ((a.y - b.y) * vp.height) / base;
  return Math.hypot(dx, dy);
}

/** 값을 범위 안으로 제한 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
