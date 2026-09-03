/**
 * 명소별 만끽지도 링크.
 *
 * 표는 `만끽지도_명소_핀번호.xlsx`에서 만든다.
 * 엑셀이 갱신되면 아래 명령으로 다시 만든다.
 *   node scripts/build-spot-links.mjs
 *
 * 명소 이름 표기가 두 목록에서 달라(지역명 유무, 띄어쓰기 등)
 * 스크립트가 유사 이름까지 대조해 맞춰 두었다.
 */

import links from "./spot-links.json";

/** 만끽지도 명소 상세 주소 형식 */
const MAP_BASE = "https://spot100x100.kr/map/#p=";

const PIN_BY_NAME: Record<string, number> = links;

/**
 * 명소 이름으로 만끽지도 링크를 얻는다.
 *
 * 표에 없으면 null을 준다. 화면은 그때 링크 없이 이름만 보여준다.
 * 링크가 없다고 오류처럼 보이면 안 된다.
 */
export function getSpotLink(name: string): string | null {
  const pin = PIN_BY_NAME[name];
  if (pin == null) return null;
  return `${MAP_BASE}${pin}`;
}

/** 연결된 명소 수. 점검용. */
export const SPOT_LINK_COUNT = Object.keys(PIN_BY_NAME).length;
