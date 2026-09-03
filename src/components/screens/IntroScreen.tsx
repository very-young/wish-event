"use client";

/**
 * 인트로 화면. (요구사항 1.1, 1.2, 1.7)
 * 시안의 s-intro 섹션을 그대로 옮긴다.
 */

import { useState } from "react";
import { MoonCharacter } from "../MoonCharacter";
import { COMMON, INTRO } from "@/content/copy";
import { EVENT_PERIOD } from "@/content/settings";

export interface IntroScreenProps {
  active: boolean;
  /** 처리 중이면 버튼을 잠근다 */
  busy?: boolean;
  /**
   * 로그인 여부를 확인하는 중인지.
   *
   * 확인이 끝나기 전에는 버튼을 잠근다. 그러지 않으면 이미 로그인한
   * 사람이 눌렀을 때 아무 일도 일어나지 않아 멈춘 것처럼 보인다.
   */
  checkingSession?: boolean;
  /** 로그인 상태에 따라 버튼 문구가 달라진다 */
  signedIn?: boolean;
  onStart(): void;
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
  checkingSession = false,
  signedIn = false,
  onStart,
  onLogout,
  requireAgeCheck = false,
}: IntroScreenProps) {
  const [ageChecked, setAgeChecked] = useState(false);

  /*
   * 나이 확인 전에는 버튼을 잠근다.
   *
   * 눌러본 뒤에 안 된다고 알리는 것보다, 눌리지 않는 상태를 먼저 보여주는 편이
   * 무엇을 해야 하는지 분명하다.
   */
  const blockedByAge = requireAgeCheck && !ageChecked;

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
          <label className="age-check">
            <input
              type="checkbox"
              checked={ageChecked}
              onChange={(e) => setAgeChecked(e.target.checked)}
            />
            <span>{INTRO.ageCheckLabel}</span>
          </label>
        )}

        <button
          type="button"
          className={signedIn ? "btn" : "btn btn-kakao"}
          onClick={onStart}
          disabled={busy || blockedByAge || checkingSession}
        >
          {/*
            기다리는 중에는 회전 표시와 함께 알린다.
            버튼만 잠그면 왜 눌리지 않는지 알 수 없다.
          */}
          {busy || checkingSession ? (
            <span className="btn-loading">
              <i className="btn-spinner" aria-hidden="true" />
              {checkingSession ? INTRO.checkingSession : COMMON.loading}
            </span>
          ) : signedIn ? (
            INTRO.startButtonSignedIn
          ) : (
            INTRO.startButton
          )}
        </button>

        {/*
          개인정보 안내 링크는 두지 않는다 (기획 결정).
          카카오 로그인 동의와 네이버폼 제출 시 동의로 갈음한다.
        */}
        {onLogout && (
          <div className="intro-links">
            <button type="button" className="btn-text" onClick={onLogout}>
              {COMMON.logout}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
