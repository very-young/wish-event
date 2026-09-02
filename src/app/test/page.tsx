import { TestFlow } from "@/components/TestFlow";

/**
 * 테스트 페이지. (내부 검수용)
 *
 * 실제 참여 화면과 같은 흐름을 돌리되 아래 제약을 없앤다.
 *   - 카카오 로그인 없이 바로 시작
 *   - 하루 1회 제한 없음. 몇 번이든 다시 시작
 *   - 공유하지 않아도 재도전 가능
 *   - 라운드 3 난이도를 낮춰 성공 화면까지 확인 가능
 *
 * ⚠️ 서버의 참여 기록·경품 재고·일련번호를 건드리지 않는다.
 *    당첨 화면의 일련번호는 표시용 가짜 값이다.
 *
 * 주소: /test
 */
export const metadata = {
  title: "테스트 페이지",
  // 검색에 노출될 필요가 없다
  robots: { index: false, follow: false },
};

export default function TestPage() {
  return <TestFlow />;
}
