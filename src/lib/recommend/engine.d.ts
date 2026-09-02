/**
 * 추천 엔진(engine.mjs)의 타입 선언.
 *
 * 엔진은 동료가 만든 자바스크립트 파일을 그대로 쓰기 때문에 타입이 없다.
 * 이 파일이 타입만 알려줘서 라우트에서 안전하게 부를 수 있게 한다.
 */

/** 추천된 명소 한 곳 */
export interface RecommendPick {
  /** 명소 이름 */
  "명소명": string;
  /** 지역 */
  "지역": string;
  /** 이 소원에 이곳을 권하는 이유 (한 줄) */
  catch: string;
}

export interface RecommendResult {
  /** 소원을 읽고 쓴 달님의 답장 */
  letter: string;
  /** 명소 3곳 */
  picks: RecommendPick[];
  analysis?: Record<string, unknown>;
}

/** DB에서 불러온 명소별 추천 횟수를 엔진에 넣는다 */
export function setCounts(counts: Record<string, number>): void;

/** 추천이 끝나면 늘어난 명소 이름을 받는다 (DB 반영용) */
export function setCountsSink(fn: (names: string[]) => void): void;

/** Gemini 사용량 기록을 받는다 */
export function setUsageSink(fn: (row: Record<string, unknown>) => void): void;

/** 추천 실행 (내부 재시도 1회 포함) */
export function recommend(
  category: string,
  wish: string,
  options?: { manualRetry?: boolean },
): Promise<RecommendResult>;

/**
 * 추천 실행. 같은 소원이 2분 안에 다시 오면 Gemini 대기시간을 늘려준다.
 */
export function recommendWithRetryMemory(
  category: string,
  wish: string,
): Promise<RecommendResult>;

/** 적재된 명소 수 (정상 동작 확인용) */
export function getSpotCount(): number;
