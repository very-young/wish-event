/**
 * seed 기반 결정론적 난수 생성기.
 *
 * 서버가 게임 결과를 재현해 검증하려면(설계 결정 D1) 달 궤적과 장애물이
 * 완전히 결정론적이어야 한다. 시안은 `Math.random()`을 써서 재현이
 * 불가능했다. 이 모듈이 그 자리를 대체한다.
 *
 * 알고리즘은 mulberry32다. 32비트 seed 하나로 동작하고 구현이 짧아
 * 클라이언트와 서버가 같은 수열을 내는 것을 보장하기 쉽다.
 * 암호학적 용도로는 쓰지 않는다.
 */

export interface Rng {
  /** 0 이상 1 미만의 실수 */
  next(): number;
  /** min 이상 max 미만의 실수 */
  range(min: number, max: number): number;
  /** min 이상 max 이하의 정수 */
  int(min: number, max: number): number;
  /** 50% 확률로 1 또는 -1 */
  sign(): number;
}

export function createRng(seed: number): Rng {
  // seed를 32비트 정수로 정규화. 음수나 실수가 들어와도 동작하게 한다.
  let state = Math.abs(Math.floor(seed)) % 0x100000000;
  if (state === 0) state = 0x9e3779b9; // seed 0이면 항상 같은 값이 나오는 문제 회피

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/**
 * 라운드별 seed를 생성한다. 서버가 참여 시작 시 호출해 클라이언트에 내려준다.
 *
 * 참여자가 seed를 미리 알 수 없어야 의미가 있으므로, 호출부에서
 * 예측 불가능한 값을 넣어야 한다.
 */
export function createRoundSeeds(source: () => number, rounds: number): number[] {
  return Array.from({ length: rounds }, () =>
    Math.floor(source() * 0x100000000),
  );
}
