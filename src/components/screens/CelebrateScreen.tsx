"use client";

/**
 * 당첨 발표 화면. (요구사항 9.1~9.7, 10.3)
 * 시안의 s-celebrate 섹션. 드럼롤 대기 → 짜잔 + 색종이.
 */

import { useEffect, useRef, useState } from "react";
import { MoonCharacter } from "../MoonCharacter";
import { CELEBRATE } from "@/content/copy";
import { playDrumroll, playTada } from "@/lib/sfx";

export interface CelebrateScreenProps {
  /** 경품이 소진되었으면 축하 문구를 조정한다 (요구사항 10.3) */
  prizeSoldOut: boolean;
  /** 축하 연출이 끝나면 자동으로 호출된다 */
  onNext(): void;
}

/** 드럼롤 길이(ms). 시안과 동일 */
const DRUMROLL_MS = 2000;
/** 축하 화면을 보여주는 시간(ms). 이후 자동으로 답장 화면으로 넘어간다. */
const CELEBRATE_HOLD_MS = 4200;
const CONFETTI_COUNT = 70;
const CONFETTI_COLORS = [
  "#e8c979",
  "#ffe9a8",
  "#fff4c9",
  "#f0967a",
  "#a9c9ff",
  "#fff",
];

interface Confetti {
  left: number;
  color: string;
  duration: number;
  delay: number;
  rotate: number;
  round: boolean;
}

/**
 * 이 컴포넌트는 활성일 때만 마운트된다(부모가 조건부 렌더링).
 * 덕분에 화면을 벗어날 때 상태를 되돌리는 처리가 필요 없다.
 */
export function CelebrateScreen({
  prizeSoldOut,
  onNext,
}: CelebrateScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const rollMs = reducedMotion ? 600 : DRUMROLL_MS;

    playDrumroll(rollMs);

    const holdMs = reducedMotion ? 1200 : CELEBRATE_HOLD_MS;

    const revealTimer = window.setTimeout(() => {
      setRevealed(true);
      playTada();

      if (!reducedMotion) {
        setConfetti(
          Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
            left: Math.random() * 100,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            duration: 2 + Math.random() * 2,
            delay: Math.random() * 0.6,
            rotate: Math.random() * 360,
            round: Math.random() > 0.5,
          })),
        );
        // 연출이 끝나면 요소를 정리한다 (요구사항 9.7)
        timersRef.current.push(
          window.setTimeout(() => setConfetti([]), 4600),
        );
      }

      // 버튼을 누르지 않아도 답장 화면으로 자동 전환한다
      timersRef.current.push(window.setTimeout(() => onNext(), holdMs));
    }, rollMs + 100);

    timersRef.current.push(revealTimer);

    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
    // onNext는 부모에서 안정적으로 유지되므로 최초 마운트 시 한 번만 실행한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="screen" data-active="true">
      <div className="celebrate-wrap">
        {!revealed ? (
          // 발표 대기 연출 (요구사항 9.1)
          <div className="drumroll">
            <div className="dr-moon-wrap">
              <MoonCharacter size={96} className="dr-moon" />
              <div className="dr-ring decorative" />
              <div className="dr-ring dr-ring-2 decorative" />
            </div>
            <div className="dr-dots decorative" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="sr-only">결과를 확인하고 있어요</p>
          </div>
        ) : (
          <>
            <div className="confetti-layer decorative" aria-hidden="true">
              {confetti.map((c, i) => (
                <i
                  key={i}
                  style={{
                    left: `${c.left}%`,
                    background: c.color,
                    animationDuration: `${c.duration}s`,
                    animationDelay: `${c.delay}s`,
                    transform: `rotate(${c.rotate}deg)`,
                    borderRadius: c.round ? "50%" : undefined,
                  }}
                />
              ))}
            </div>

            <div className="celebrate-inner">
              <div className="prize-moon">
                <MoonCharacter size={120} float craters />
              </div>

              {!prizeSoldOut && (
                <div className="tada-badge">{CELEBRATE.badge}</div>
              )}

              <h1 className="title-lg" style={{ fontSize: 27 }}>
                {prizeSoldOut ? CELEBRATE.soldOutTitle : CELEBRATE.title}
              </h1>

              <p className="lead">
                {(prizeSoldOut ? CELEBRATE.soldOutBody : CELEBRATE.body)
                  .split("\n")
                  .map((line, i) => (
                    <span key={i}>
                      {line}
                      {i === 0 && <br />}
                    </span>
                  ))}
              </p>

              {/* 잠시 후 자동으로 답장 화면으로 넘어간다 */}
              <p className="celebrate-next-hint">{CELEBRATE.autoNextHint}</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
