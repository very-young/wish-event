/**
 * 라운드 3 장애물. (요구사항 8.6, 8.7)
 *
 * 구름 3개와 제트기 1대가 서로 다른 높이·속도·방향으로 화면을 지나간다.
 * 화면을 벗어나면 반대편에서 다시 등장한다.
 *
 * 시안은 Math.random()으로 초기값을 정했다. 여기서는 seed를 써서
 * 서버가 같은 장애물 배치를 재현할 수 있게 한다.
 */

import { OBSTACLE, getRoundConfig } from "./config";
import type { Obstacle } from "./physics";
import { createRng } from "./rng";

/**
 * 장애물 초기 배치. 시안의 값을 가상 좌표로 환산해 유지한다.
 *
 * 시안 기준 프레임: 420x920
 *  - 구름 반지름 42~58px, 속도 0.5~1.2px/frame
 *  - 제트기 반지름 26px, 속도 4.0~5.2px/frame
 */
export function initObstacles(round: number, seed: number): Obstacle[] {
  const cfg = getRoundConfig(round);
  if (!cfg.hasObstacles) return [];

  const rng = createRng(seed);
  const W = 420;
  const H = 920;
  const px = (v: number) => v / W; // 가로 픽셀 → 가상 x
  const rad = (v: number) => v / W; // 반지름 픽셀 → scaleBase 비율

  const clouds: Obstacle[] = [
    {
      kind: "cloud",
      pos: { x: px(rng.range(-120, 0)), y: rng.range(0.16, 0.22) },
      vx: px(rng.range(0.7, 1.2)),
      radius: rad(rng.range(42, 52)),
    },
    {
      kind: "cloud",
      pos: { x: 1 + px(rng.range(60, 160)), y: rng.range(0.3, 0.38) },
      vx: -px(rng.range(0.6, 1.1)),
      radius: rad(rng.range(48, 58)),
    },
    {
      kind: "cloud",
      pos: { x: rng.range(0.3, 0.7), y: rng.range(0.1, 0.15) },
      vx: rng.sign() * px(rng.range(0.5, 0.9)),
      radius: rad(rng.range(36, 46)),
    },
  ];

  // 제트기는 무작위 방향에서 빠르게 지나간다.
  const fromLeft = rng.next() < 0.5;
  const jet: Obstacle = {
    kind: "jet",
    pos: {
      x: fromLeft ? px(-100) : 1 + px(100),
      y: rng.range(0.38, 0.46),
    },
    vx: (fromLeft ? 1 : -1) * px(rng.range(4.0, 5.2)),
    radius: rad(26),
  };

  void H; // 세로는 초기 배치에만 쓰이고 이동에는 관여하지 않음

  return [...clouds, jet];
}

/**
 * 장애물을 한 스텝 이동시킨다. 화면을 벗어나면 반대편에서 재등장 (요구사항 8.7).
 *
 * 순수 함수로 유지해 서버 재현이 가능하게 한다.
 */
export function stepObstacles(
  obstacles: readonly Obstacle[],
): Obstacle[] {
  const m = OBSTACLE.wrapMargin;
  return obstacles.map((o) => {
    let x = o.pos.x + o.vx;
    if (o.vx > 0 && x > 1 + m) x = -m;
    if (o.vx < 0 && x < -m) x = 1 + m;
    return { ...o, pos: { x, y: o.pos.y } };
  });
}

/**
 * 특정 tick의 장애물 상태를 직접 계산한다.
 *
 * 재현 검증에서 임의 tick의 상태가 필요할 때 사용한다.
 * 반복 이동과 동일한 결과를 내야 하므로 같은 wrap 규칙을 적용한다.
 */
export function obstaclesAtTick(
  round: number,
  seed: number,
  tick: number,
): Obstacle[] {
  let obstacles = initObstacles(round, seed);
  for (let i = 0; i < tick; i++) {
    obstacles = stepObstacles(obstacles);
  }
  return obstacles;
}
