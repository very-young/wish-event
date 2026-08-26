/**
 * 이벤트 진입점.
 *
 * 요구사항 1.8: 공유 링크로 들어와도 이 화면부터 시작한다.
 * 결과 화면을 별도 URL로 만들지 않고 같은 경로에서 화면만 전환하므로,
 * 공유 링크에 남의 결과가 실릴 여지가 없다.
 */

import { EventFlow } from "@/components/EventFlow";

export default function Home() {
  return <EventFlow />;
}
