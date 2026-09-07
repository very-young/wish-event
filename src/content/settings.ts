/**
 * 이벤트 운영 설정값.
 *
 * 여기 값들은 코드 수정 없이 바꿀 수 있어야 한다 (요구사항 10.8).
 * 경품 수량은 DB(prize_stock)에서 관리하고, 아래 PRIZE_TOTAL_DEFAULT는
 * 최초 마이그레이션 시 넣을 초기값으로만 쓴다.
 */

/**
 * 이벤트 기간. 한국 시간 기준.
 *
 * ⚠️ 실제 참여 차단은 DB(event_config)가 판정한다.
 *    이 값은 화면에 기간을 보여주는 데 쓴다.
 *    바꿀 때는 DB도 함께 맞춰야 한다 (scripts/set-event-period.mjs).
 */
export const EVENT_PERIOD = {
  /** 시작일 (이 날 00:00부터 참여 가능) */
  startDate: "2026-09-21",
  /** 종료일 (이 날 23:59:59까지 참여 가능) */
  endDate: "2026-09-30",
} as const;

/** 하루 기준 시각을 계산할 때 사용하는 시간대 (요구사항 13.5, 13.6) */
export const EVENT_TIMEZONE = "Asia/Seoul";

/** 계정당 하루 기본 참여 기회 (요구사항 13.3) */
export const DAILY_BASE_CHANCES = 1;

/**
 * 경품 초기 수량.
 * TODO: 추후 실제 수량으로 교체. 확정 전에는 0으로 두어
 *       "게임은 되고 경품만 종료" 경로(요구사항 10.3)를 테스트한다.
 */
export const PRIZE_TOTAL_DEFAULT = 0;

/** 경품 재고 식별자. 경품 종류가 하나이므로 고정값. */
export const PRIZE_STOCK_ID = "main";

/**
 * 공유 전송 확인을 기다리는 최대 시간(ms). (요구사항 12.20)
 *
 * 이 시간이 지나면 대기 화면을 닫는다. 화면에 남은 시간을 보여주지는
 * 않는다 — 숫자가 줄어드는 것을 보면 그 안에 끝내야 한다고 느껴
 * 친구를 고르는 동안 조급해진다.
 *
 * ⚠️ 대기 화면이 닫혀도 공유는 무효가 되지 않는다.
 *    티켓이 살아 있는 동안(SHARE_TICKET_TTL_MS) 전송을 마치면
 *    재도전이 열린다.
 */
export const SHARE_WAIT_TIMEOUT_MS = 3 * 60_000;

/**
 * 공유 티켓 유효 시간(ms). 대기 화면 시간보다 길게 둔다.
 *
 * 대기 화면이 닫힌 뒤에 전송을 마치는 경우가 많아, 그때도 인정하려면
 * 티켓이 더 오래 살아 있어야 한다.
 */
export const SHARE_TICKET_TTL_MS = 5 * 60_000;

/** 공유 확인 폴링 간격(ms). 실시간 구독 실패 시 폴백에 사용. */
export const SHARE_POLL_INTERVAL_MS = 3_000;

/**
 * 당첨자 확인용 네이버폼 링크.
 *
 * 환경 변수로 넣으면 코드 수정 없이 교체할 수 있다.
 * 비어 있으면 버튼이 눌리지 않는 상태로 표시된다 (요구사항 10.5).
 */
export const WINNER_FORM_URL =
  process.env.NEXT_PUBLIC_WINNER_FORM_URL ?? "";

/**
 * 공유 카드 대표 이미지 절대 주소.
 * TODO: 배포 도메인 확정 후 교체. 카카오는 상대 경로를 허용하지 않는다.
 */
export const SHARE_IMAGE_URL = "";

/** 이벤트 페이지 기본 주소. 공유 카드의 이동 링크에 사용 (요구사항 12.27). */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** 소원 문구 길이 제한 (요구사항 4.3, 4.4) */
export const WISH_TEXT_LIMIT = {
  min: 2,
  max: 80,
} as const;

/** 종이 접기 단계 수 (요구사항 6.5) */
export const FOLD_STEPS = 5;

/** 소원 유형별로 결과에 보여줄 명소 수 (요구사항 11.6) */
export const PLACES_PER_RESULT = 3;
