"use client";

/**
 * 달님의 답장 편지 화면. (요구사항 11.1~11.10, 12.1, 12.21)
 * 시안의 s-letter 섹션. 봉투를 눌러 열고 명소 3곳을 본다.
 */

import { useState } from "react";
import { getCategory, type CategoryId, type Place } from "@/content/categories";
import { INVITE_SHARE, LETTER, RETRY_SHARE, WINNER } from "@/content/copy";
import { WINNER_FORM_URL } from "@/content/settings";

export interface LetterScreenProps {
  category: CategoryId | null;
  /** 게임 성공 여부 */
  won: boolean;
  /** 경품 소진 여부 */
  prizeSoldOut: boolean;
  /** 서버가 확정한 추천 명소. 없으면 유형 기본값을 쓴다 */
  places?: readonly Place[];
  /**
   * 당첨 일련번호. 서버가 당첨 확정 시 발급한다 (요구사항 10.5).
   * 참여자는 이 번호를 복사해 네이버폼으로 제출한다.
   */
  serial?: string | null;
  onShareRetry(): void;
  onShareInvite(): void;
  onSaveImage(): void;
  /** 복사 결과를 알린다 */
  onNotify?(message: string): void;
}

/**
 * 이 컴포넌트는 활성일 때만 마운트된다(부모가 조건부 렌더링).
 * 덕분에 화면을 벗어날 때 봉투 상태를 되돌리는 처리가 필요 없다.
 */
export function LetterScreen({
  category,
  won,
  prizeSoldOut,
  places,
  serial,
  onShareRetry,
  onShareInvite,
  onSaveImage,
  onNotify,
}: LetterScreenProps) {
  const [opened, setOpened] = useState(false);

  const cat = category ? getCategory(category) : undefined;
  const shownPlaces = places ?? cat?.places ?? [];
  const prizeWon = won && !prizeSoldOut;

  const handleCopySerial = async () => {
    if (!serial) return;
    try {
      await navigator.clipboard.writeText(serial);
      onNotify?.(WINNER.serialCopied);
    } catch {
      // 클립보드 접근이 막힌 환경(구형 브라우저, 비보안 컨텍스트 등)
      onNotify?.(WINNER.serialCopyFailed);
    }
  };

  return (
    <section className="screen scrollable" data-active="true">
      <div className="letter-outer">
        {!opened ? (
          // 편지 도착 (요구사항 11.1, 11.2)
          <div className="center-col letter-intro">
            <button
              type="button"
              className="envelope"
              onClick={() => setOpened(true)}
              aria-label="달님의 편지 열기"
            >
              <svg viewBox="0 0 150 104" width="150" height="104">
                <rect
                  x="2"
                  y="14"
                  width="146"
                  height="86"
                  rx="10"
                  fill="#efe4c8"
                />
                <path
                  d="M2 22 L75 66 L148 22"
                  fill="none"
                  stroke="#cbb47e"
                  strokeWidth="3"
                />
                <path d="M2 20 L75 60 L148 20 L148 14 L2 14 Z" fill="#e3d3a8" />
                <circle cx="75" cy="52" r="13" fill="#e8c979" />
                <text
                  x="75"
                  y="58"
                  fontSize="14"
                  textAnchor="middle"
                  fill="#7a5a2a"
                >
                  🌙
                </text>
              </svg>
            </button>

            <p className="lead" style={{ textAlign: "center" }}>
              {(won ? LETTER.arrivedWin : LETTER.arrivedLose)
                .split("\n")
                .map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <b className="gold">{line}</b> : line}
                    {i === 0 && <br />}
                  </span>
                ))}
            </p>
          </div>
        ) : (
          <div className="letter-opened">
            {/*
              당첨 배너는 표시하지 않는다.
              직전 축하 화면에서 이미 당첨을 알렸고, 하단 "경품 받는 방법"에서
              다시 안내하므로 중복이다 (기획 결정).
            */}

            {/* 편지 본문 (요구사항 11.4, 11.5) */}
            <div className="letter-card fade-in">
              <div className="letter-from">{LETTER.from}</div>
              <p className="letter-body">
                {won ? LETTER.bodyWin : LETTER.bodyLose}
              </p>
            </div>

            {/* 명소 3곳 (요구사항 11.6) */}
            <div style={{ marginTop: 26 }} className="fade-in">
              <div className="eyebrow">{LETTER.placesEyebrow}</div>
              <div className="place-list">
                {shownPlaces.map((p, i) => (
                  <div className="place" key={i}>
                    <div className="place-pic" aria-hidden="true">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" />
                      ) : (
                        p.emoji
                      )}
                    </div>
                    <div className="place-info">
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 당첨자 안내 (요구사항 10.5, 10.7) */}
            {prizeWon && (
              <div className="winner-guide fade-in">
                <div className="eyebrow">{WINNER.guideTitle}</div>
                <p className="lead">{WINNER.guideBody}</p>

                <div className="serial-box">
                  <span className="serial-label">{WINNER.serialLabel}</span>
                  <code className="serial-value">{serial ?? "발급 중…"}</code>
                  <button
                    type="button"
                    className="serial-copy"
                    onClick={handleCopySerial}
                    disabled={!serial}
                  >
                    {WINNER.copySerial}
                  </button>
                </div>
              </div>
            )}

            <div className="bottom letter-actions fade-in">
              {/* 당첨자는 네이버폼 이동, 그 외에는 결과 이미지 저장 */}
              {prizeWon ? (
                WINNER_FORM_URL ? (
                  <a
                    className="btn"
                    href={WINNER_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {WINNER.formButton}
                  </a>
                ) : (
                  // 링크가 준비되기 전에는 비활성 상태로 자리를 유지한다
                  <button type="button" className="btn" disabled>
                    {WINNER.formButton}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={onSaveImage}
                >
                  {LETTER.saveImageButton}
                </button>
              )}

              {/*
                실패 시에는 재도전용 공유만, 성공 시에는 초대용 공유만 노출한다
                (요구사항 12.1, 12.2, 12.21, 12.22)
              */}
              {!won ? (
                <>
                  <p className="share-prompt">
                    {RETRY_SHARE.prompt.split("\n").map((line, i) => (
                      <span key={i}>
                        {line}
                        {i === 0 && <br />}
                      </span>
                    ))}
                  </p>
                  <button
                    type="button"
                    className="btn btn-kakao"
                    onClick={onShareRetry}
                  >
                    {RETRY_SHARE.button}
                  </button>
                  {/*
                    안내는 공유 대기 화면에서 보여준다.
                    버튼을 누르기 전에는 필요 없어 여기서는 생략한다.
                  */}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-kakao"
                    onClick={onShareInvite}
                  >
                    {INVITE_SHARE.button}
                  </button>
                  <p className="share-notice">{INVITE_SHARE.notice}</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
