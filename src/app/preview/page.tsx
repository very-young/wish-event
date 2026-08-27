import { PreviewFlow } from "@/components/PreviewFlow";

/**
 * 결과 화면 미리보기. (개발·검수용)
 *
 * 3라운드를 실제로 통과하지 않고도 성공·실패 화면을 확인하기 위한 페이지다.
 * 게임을 거치지 않으므로 참여 기회나 일련번호를 소모하지 않는다.
 *
 * 주소: /preview
 */
export const metadata = {
  title: "결과 화면 미리보기",
  // 검색에 노출될 필요가 없다
  robots: { index: false, follow: false },
};

export default function PreviewPage() {
  return <PreviewFlow />;
}
