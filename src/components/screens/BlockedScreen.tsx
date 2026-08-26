/**
 * 참여 차단 안내 화면. (요구사항 1.4, 1.5, 13.4, 13.7)
 *
 * 기간 외, 기회 소진, 당첨 완료 등 상황별로 다른 안내를 보여준다.
 */

import { MoonCharacter } from "../MoonCharacter";

export interface BlockedScreenProps {
  title: string;
  body: string;
  onBack(): void;
}

export function BlockedScreen({ title, body, onBack }: BlockedScreenProps) {
  return (
    <section className="screen" data-active="true">
      <div className="spacer" />
      <div className="center-col">
        <MoonCharacter size={110} float className="intro-moon" />
        <h2 className="title-md">{title}</h2>
        <p className="lead" style={{ marginTop: 12 }}>
          {body}
        </p>
      </div>
      <div className="spacer" />
      <div className="bottom">
        <button type="button" className="btn ghost" onClick={onBack}>
          처음으로
        </button>
      </div>
    </section>
  );
}
