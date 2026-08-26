"use client";

/**
 * 종이 접기 화면. (요구사항 6.1~6.7)
 * 시안의 s-fold 섹션. 5단계 SVG를 그대로 옮긴다.
 */

import { useEffect, useRef, useState } from "react";
import { FOLD_SCREEN } from "@/content/copy";
import { FOLD_STEPS } from "@/content/settings";

export interface FoldScreenProps {
  /** 접기 완료 후 발사 화면으로 전환 */
  onComplete(): void;
}

/** 시안의 FOLD_STAGES를 그대로 옮긴 SVG 단계 (0=펼친 종이 ~ 5=완성) */
const FOLD_STAGES: readonly React.ReactNode[] = [
  // 0: 펼친 종이
  <g key="0">
    <rect x="10" y="6" width="150" height="198" rx="4" fill="#f4ecd8" />
    <g stroke="#d9c9a3" strokeWidth="1.5">
      <line x1="20" y1="40" x2="150" y2="40" />
      <line x1="20" y1="74" x2="150" y2="74" />
      <line x1="20" y1="108" x2="150" y2="108" />
      <line x1="20" y1="142" x2="150" y2="142" />
    </g>
  </g>,
  // 1: 반으로 접기
  <g key="1">
    <rect x="10" y="6" width="150" height="198" rx="4" fill="#f4ecd8" />
    <rect x="10" y="6" width="75" height="198" rx="4" fill="#e9ddbd" />
    <line x1="85" y1="6" x2="85" y2="204" stroke="#c9b57e" strokeWidth="2" />
  </g>,
  // 2: 모서리를 중앙으로
  <g key="2">
    <path d="M85,6 L160,70 L160,204 L10,204 L10,70 Z" fill="#f4ecd8" />
    <path d="M85,6 L85,204 L10,204 L10,70 Z" fill="#e6dabb" />
    <path d="M85,6 L160,70 L85,70 Z" fill="#efe4c8" />
    <path d="M85,6 L10,70 L85,70 Z" fill="#ded2b3" />
    <line x1="85" y1="6" x2="85" y2="204" stroke="#c9b57e" strokeWidth="1.5" />
  </g>,
  // 3: 날개 선 잡기
  <g key="3">
    <path
      d="M85,10 L150,190 L85,165 L20,190 Z"
      fill="#f4ecd8"
      stroke="#d9c9a3"
      strokeWidth="1.5"
    />
    <path d="M85,10 L85,165 L20,190 Z" fill="#e6dabb" />
    <line x1="85" y1="10" x2="85" y2="165" stroke="#cbb47e" strokeWidth="1.5" />
  </g>,
  // 4: 날개 펼치기
  <g key="4">
    <path
      d="M85,8 L158,180 L85,150 L12,180 Z"
      fill="#f4ecd8"
      stroke="#d9c9a3"
      strokeWidth="2"
    />
    <path d="M85,8 L85,150 L12,180 Z" fill="#e6dabb" />
    <line x1="85" y1="8" x2="85" y2="150" stroke="#cbb47e" strokeWidth="1.5" />
  </g>,
  // 5: 완성 (살짝 기울어짐)
  <g key="5" transform="rotate(-8 85 100)">
    <path
      d="M85,8 L158,180 L85,150 L12,180 Z"
      fill="#f6efdd"
      stroke="#d9c9a3"
      strokeWidth="2"
    />
    <path d="M85,8 L85,150 L12,180 Z" fill="#e6dabb" />
    <line x1="85" y1="8" x2="85" y2="150" stroke="#cbb47e" strokeWidth="1.5" />
  </g>,
];

/**
 * 이 컴포넌트는 활성일 때만 마운트된다(부모가 조건부 렌더링).
 * 덕분에 화면을 벗어날 때 접기 진행을 되돌리는 처리가 필요 없다.
 */
export function FoldScreen({ onComplete }: FoldScreenProps) {
  const [folds, setFolds] = useState(0);
  const [squash, setSquash] = useState(false);
  const [liftOff, setLiftOff] = useState(false);
  const timersRef = useRef<number[]>([]);

  // 화면을 벗어나면 진행 중인 타이머를 정리한다
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  const handleTap = () => {
    // 5단계에 도달하면 추가 터치를 무시한다 (요구사항 6.7)
    if (folds >= FOLD_STEPS || liftOff) return;

    const next = folds + 1;
    setFolds(next);

    // 눌리는 피드백 (요구사항 6.3)
    setSquash(true);
    later(() => setSquash(false), 120);

    if (next >= FOLD_STEPS) {
      // 완성 후 이륙 연출 → 발사 화면 (요구사항 6.6)
      later(() => setLiftOff(true), 500);
      later(() => onComplete(), 1250);
    }
  };

  const hint =
    folds === 0
      ? FOLD_SCREEN.initialHint
      : folds >= FOLD_STEPS
        ? FOLD_SCREEN.readyHint
        : FOLD_SCREEN.stepHints[folds - 1];

  return (
    <section className="screen" data-active="true">
      <div className="eyebrow" style={{ textAlign: "center" }}>
        {FOLD_SCREEN.eyebrow}
      </div>

      <div className="fold-stage">
        <button
          type="button"
          className={`fold-paper ${squash ? "squash" : ""} ${liftOff ? "lift" : ""}`}
          onClick={handleTap}
          aria-label={`종이 접기. ${folds}단계 중 ${FOLD_STEPS}단계. 눌러서 접기`}
        >
          <svg viewBox="0 0 170 210" className="fold-svg">
            {FOLD_STAGES[folds]}
          </svg>
        </button>

        <p className="fold-hint" aria-live="polite">
          {hint}
        </p>

        <div
          className="fold-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={FOLD_STEPS}
          aria-valuenow={folds}
        >
          <i style={{ width: `${(folds / FOLD_STEPS) * 100}%` }} />
        </div>
      </div>
    </section>
  );
}
