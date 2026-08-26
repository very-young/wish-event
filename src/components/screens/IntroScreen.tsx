/**
 * 인트로 화면. (요구사항 1.1, 1.2, 1.7)
 * 시안의 s-intro 섹션을 그대로 옮긴다.
 */

import { MoonCharacter } from "../MoonCharacter";
import { COMMON, INTRO, PRIVACY } from "@/content/copy";
import { EVENT_PERIOD } from "@/content/settings";

export interface IntroScreenProps {
  active: boolean;
  /** 처리 중이면 버튼을 잠근다 */
  busy?: boolean;
  /** 로그인 상태에 따라 버튼 문구가 달라진다 */
  signedIn?: boolean;
  onStart(): void;
  /** 개인정보 안내 열기 (요구사항 2.6) */
  onOpenPrivacy?(): void;
  /** 로그아웃 (요구사항 2.7). 로그인 상태에서만 전달된다 */
  onLogout?(): void;
}

function formatPeriod(): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}월 ${Number(d)}일`;
  };
  return `${fmt(EVENT_PERIOD.startDate)} ~ ${fmt(EVENT_PERIOD.endDate)}`;
}

export function IntroScreen({
  active,
  busy = false,
  signedIn = false,
  onStart,
  onOpenPrivacy,
  onLogout,
}: IntroScreenProps) {
  return (
    <section className="screen" data-active={active}>
      <div className="spacer" />

      <div className="center-col">
        <MoonCharacter size={150} float craters className="intro-moon" />
        <div className="eyebrow">{INTRO.eyebrow}</div>
        <h1 className="title-lg">
          {INTRO.title.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i === 0 && <br />}
            </span>
          ))}
        </h1>
        <p className="lead">
          {INTRO.lead.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i === 0 && <br />}
            </span>
          ))}
        </p>

        <div className="intro-period">
          <span className="intro-period-label">{INTRO.periodLabel}</span>
          <span className="intro-period-value">{formatPeriod()}</span>
        </div>

        <ol className="intro-steps">
          {INTRO.howToSteps.map((step, i) => (
            <li key={i}>
              <span className="intro-step-no">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="spacer" />

      <div className="bottom">
        <button
          type="button"
          className={signedIn ? "btn" : "btn btn-kakao"}
          onClick={onStart}
          disabled={busy}
        >
          {busy
            ? COMMON.loading
            : signedIn
              ? INTRO.startButtonSignedIn
              : INTRO.startButton}
        </button>

        <div className="intro-links">
          {onOpenPrivacy && (
            <button type="button" className="btn-text" onClick={onOpenPrivacy}>
              {PRIVACY.linkLabel}
            </button>
          )}
          {onLogout && (
            <button type="button" className="btn-text" onClick={onLogout}>
              {COMMON.logout}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
