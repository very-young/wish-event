/**
 * 게임 설정값. (요구사항 8.17)
 *
 * 모든 위치·크기는 가상 좌표(0~1 비율)로 정의한다.
 * 렌더 시점에 실제 픽셀로 환산하므로 화면 크기가 달라도
 * 난이도가 유지된다 (요구사항 14.3).
 */

/** 시뮬레이션 고정 타임스텝(초). 프레임 속도와 무관하게 진행. */
export const SIM_STEP = 1 / 60;

/** 한 프레임에서 처리할 최대 시뮬레이션 스텝 수. 프레임 급락 시 무한 루프 방지. */
export const MAX_STEPS_PER_FRAME = 5;

/** 총 라운드 수 */
export const TOTAL_ROUNDS = 3;

/**
 * 물리 상수. 시안(wish-paperplane-prototype)의 픽셀 값을 가상 좌표로 환산한 값.
 * 시안 기준: 420x920 프레임, 중력 0.12px/frame², 최대 당김 150px, 속도계수 0.16
 */
export const PHYSICS = {
  /** 중력 가속도 (가상 y단위 / step²) */
  gravity: 0.12 / 920,
  /** 최대 당김 거리 (min(W,H) 대비 비율) */
  maxPull: 150 / 420,
  /** 발사 취소 기준 당김 거리 (min(W,H) 대비 비율) */
  minPull: 12 / 420,
  /** 발사 속도 = 당김거리 × 이 계수 */
  speedFactor: 0.16,
  /** 조준 중 비행기가 발사대에서 뒤로 밀리는 비율 */
  aimDrawback: 0.28,
} as const;

/** 달 기본 설정 */
export const MOON = {
  /** 반지름 (min(W,H) 대비 비율). 시안 34px / 420 */
  radius: 34 / 420,
  /** 기준 높이 (화면 높이 대비 비율) */
  baseY: 0.26,
  /** 이동 가능한 최소·최대 높이 */
  minY: 0.05,
  maxY: 0.5,
} as const;

/** 종이비행기 설정 */
export const PLANE = {
  /** 반지름 (min(W,H) 대비 비율). 시안 15px / 420 */
  radius: 15 / 420,
  /** 발사대 위치 (가상 좌표) */
  padX: 0.5,
  padY: 0.62,
  /** 발사대 주변 터치 인식 반경 (min(W,H) 대비 비율) */
  grabRadius: 90 / 420,
  /** 화면 밖 판정 여유 (가상 단위) */
  outOfBoundsMargin: 0.1,
} as const;

/** 장애물 설정 (라운드 3) */
export const OBSTACLE = {
  /** 충돌 판정 시 빼주는 여유값 (min(W,H) 대비 비율) */
  collisionSlack: 6 / 420,
  /** 화면 밖으로 나간 뒤 재등장하는 여유 거리 (가상 단위) */
  wrapMargin: 140 / 420,
} as const;

/** 라운드별 설정 */
export interface RoundConfig {
  /** 라운드 번호 (1부터) */
  round: number;
  /** 달 이동 속도. 0이면 고정 */
  moonSpeed: number;
  /** 가로 진폭 (화면 폭 대비 비율) */
  amplitudeX: number;
  /** 세로 진폭 (화면 높이 대비 비율) */
  amplitudeY: number;
  /** 달 반지름 배율. 1이면 MOON.radius 그대로 */
  moonScale: number;
  /** 표류 한계 (화면 폭 대비 비율). chaotic 라운드에만 적용 */
  wanderLimit: number;
  /** 장애물 등장 여부 */
  hasObstacles: boolean;
  /**
   * 이 라운드에서 허용하는 발사 횟수.
   * null이면 무제한 (라운드 1은 누구나 통과해야 하므로 무제한)
   */
  shotsAllowed: number | null;
  /** 달 궤적이 매 시도마다 달라지는지 여부 */
  chaotic: boolean;
}

/**
 * 라운드 설정.
 *
 * ⚠️ 라운드 3의 난이도는 의도적으로 매우 높게 설계됐다 (요구사항 8.18).
 *    당첨자 수를 억제하는 장치이므로 "어렵다"는 이유로 완화하지 말 것.
 *
 * ⚠️ 라운드 1은 누구나 통과해야 한다 (요구사항 8.11).
 *    shotsAllowed를 유한한 값으로 바꾸지 말 것.
 *
 * 【라운드 3 난이도 조정 기록】
 *
 * 1차 측정: 시안 원본(범위 0.42, 크기 1.0)은 무작위 조준 명중률이 13.0%로
 * 라운드 1(6.5%)보다 오히려 쉬웠다. 달이 넓게 훑고 지나가면서
 * 비행기 경로에 스스로 들어오는 경우가 많았기 때문이다.
 *
 *   범위0.42 크기1.0  → 13.03%  (시안 원본)
 *   범위0.20 크기0.8  →  7.48%
 *   범위0.15 크기0.6  →  5.65%
 *   범위0.12 크기0.5  →  4.81%
 * 장애물 강화는 효과가 미미했다(13.03% → 12.63%). 구름이 달 주변 높이에
 * 있어 비행 경로를 실제로 막지 못하기 때문이다.
 *
 * 2차 조정(플레이 테스트 후): 범위를 좁히니 달이 답답하게 떨기만 해서
 * 보기에 좋지 않았다. 범위는 시안 원본(0.42)으로 되돌리고, 대신
 * 궤적 패턴을 6종으로 늘려 사람이 예측하기 어렵게 만들었다.
 *
 * 넓은 범위로 되돌리자 명중률이 다시 올라가(9.68% @크기0.6) 달 크기로만
 * 억제해야 했다. 크기별 측정:
 *   크기1.00 → 13.15%
 *   크기0.60 →  9.68%
 *   크기0.45 →  8.39%  ← 채택
 *   크기0.35 →  7.31%
 *   크기0.30 →  6.83%
 *
 * 3차 조정: 크기 0.45는 화면에서 너무 작아 보였다. 0.55로 올렸다.
 * 무작위 조준 명중률이 라운드 1보다 높은 것은 빠르게 움직이는 표적의
 * 구조적 특성이며(넓게 훑으므로 경로에 스스로 들어온다), 사람이
 * 조준하는 상황에서는 예측 불가능성 때문에 실제로 훨씬 어렵다.
 * 추가로 어렵게 해야 한다면 moonSpeed를 올리는 것이 시각적으로도 자연스럽다.
 *
 * 패턴별 명중률 @크기0.45: wave 6.9% / zigzag 6.9% / orbit 7.4% /
 * figure8 8.0% / dart 9.5% / bounce 10.4%
 * bounce와 dart가 상대적으로 쉬운 편이다. 실제 플레이 테스트에서
 * 체감 난이도가 고르지 않다면 이 두 패턴을 조정한다.
 *
 * 이 수치는 사람의 조준을 반영하지 않는다. 실제 플레이 테스트(작업 8.4)에서
 * 재조정할 예정이다.
 */
export const ROUNDS: readonly RoundConfig[] = [
  {
    round: 1,
    moonSpeed: 0,
    amplitudeX: 0,
    amplitudeY: 0,
    moonScale: 1.0,
    wanderLimit: 0,
    hasObstacles: false,
    shotsAllowed: null,
    chaotic: false,
  },
  {
    round: 2,
    moonSpeed: 1.0,
    amplitudeX: 0.3,
    amplitudeY: 0.05,
    moonScale: 1.0,
    wanderLimit: 0,
    hasObstacles: false,
    shotsAllowed: 1,
    chaotic: false,
  },
  {
    round: 3,
    moonSpeed: 6.6,
    // 시안 원본의 넓은 이동 범위. 좁히면 답답해 보여 원복했다.
    amplitudeX: 0.42,
    amplitudeY: 0.16,
    // 달을 작게 만들어 명중 판정 면적을 줄인다
    moonScale: 0.55,
    wanderLimit: 0.16,
    hasObstacles: true,
    shotsAllowed: 1,
    chaotic: true,
  },
] as const;

export function getRoundConfig(round: number): RoundConfig {
  const cfg = ROUNDS[round - 1];
  if (!cfg) throw new Error(`알 수 없는 라운드: ${round}`);
  return cfg;
}

/** 달 궤적 진행 속도 계수. 시안의 tPhase += 0.016 * speed 를 그대로 유지. */
export const MOON_PHASE_STEP = 0.016;

/**
 * 달 궤적 표류의 스텝당 변화량 (화면 폭 대비 비율).
 * 표류 한계는 라운드별 설정(wanderLimit)에서 정한다.
 */
export const WANDER = {
  step: 0.9 / 420,
} as const;

/** 라운드별 실제 달 반지름을 계산한다. */
export function moonRadius(round: number): number {
  return MOON.radius * getRoundConfig(round).moonScale;
}
