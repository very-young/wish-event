"use client";

/**
 * 인트로 화면. (요구사항 1.1, 1.2, 1.7)
 * 시안의 s-intro 섹션을 그대로 옮긴다.
 */

import { useState } from "react";
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
  /**
   * 나이 확인을 요구할지.
   *
   * 만 14세 미만은 개인정보 수집에 법정대리인 동의가 필요해
   * 참여 대상에서 제외한다 (기획 결정).
   * 테스트 페이지에서는 끈다.
   */
  requireAgeCheck?: boolean;
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
  requireAgeCheck = false,
}: IntroScreenProps) {
  const [ageChecked, setAgeChecked] = useState(false);
  const [showAgeWarning, setShowAgeWarning] = useState(false);

  const handleStart = () => {
    if (requireAgeCheck && !ageChecked) {
      // 체크하지 않으면 진행하지 않고 이유를 알린다
      setShowAgeWarning(true);
      return;
    }
    onStart();
  };

  return (
    <section className="screen" data-active={active}>
      <div className="spacer" />

      <div className="center-col">
        <MoonCharacter size={150} float craters className="intro-moon" />
        <div className="eyebrow">{INTRO.eyebrow}</div>
        <h1 className="title-lg intro-title">
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

      </div>

      <div className="spacer" />

      <div className="bottom">
        {/* 만 14세 이상 확인 (기획 결정) */}
        {requireAgeCheck && (
          <>
            <label className="age-check">
              <input
                type="checkbox"
                checked={ageChecked}
                onChange={(e) => {
                  setAgeChecked(e.target.checked);
                  if (e.target.checked) setShowAgeWarning(false);
                }}
              />
              <span>{INTRO.ageCheckLabel}</span>
            </label>
            {showAgeWarning && (
              <p className="age-warning" role="alert">
                {INTRO.ageCheckRequired}
              </p>
            )}
          </>
        )}

        <button
          type="button"
          className={signedIn ? "btn" : "btn btn-kakao"}
          onClick={handleStart}
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
