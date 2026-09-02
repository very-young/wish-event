"use client";

/**
 * 달님의 답장을 기다리는 화면.
 *
 * 추천은 종이접기 시점에 시작하므로 대부분은 게임이 끝날 때 이미 준비돼 있다.
 * 게임을 아주 빨리 끝낸 경우에만 이 화면을 보게 된다.
 *
 * 오류처럼 보이지 않는 것이 핵심이다. 그래서 종이비행기가 달을 향해
 * 날아가는 연출을 보여주고, 문구를 번갈아 바꿔 멈추지 않았음을 알린다.
 */

import { useEffect, useState } from "react";
import { MoonCharacter } from "./MoonCharacter";
import { LETTER_LOADING } from "@/content/copy";

export interface LetterLoadingProps {
  /** 문구를 바꾸는 간격(ms) */
  rotateMs?: number;
}

export function LetterLoading({ rotateMs = 3200 }: LetterLoadingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const messages = LETTER_LOADING.messages;
    if (messages.length < 2) return;

    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, rotateMs);

    return () => window.clearInterval(timer);
  }, [rotateMs]);

  return (
    <div className="letter-loading" role="status" aria-live="polite">
      {/* 달을 향해 종이비행기가 날아가는 연출 */}
      <div className="ll-sky" aria-hidden="true">
        <MoonCharacter size={92} float craters className="ll-moon" />
        <span className="ll-plane">
          <svg viewBox="0 0 32 32" width="30" height="30">
            <path d="M16 2 L28 26 L16 20 L4 26 Z" fill="#f4ecd8" />
            <path d="M16 2 L16 20 L4 26 Z" fill="#ded2b3" />
          </svg>
        </span>
        <span className="ll-trail" />
      </div>

      {/*
        문구가 바뀔 때 부드럽게 전환되도록 key를 준다.
        key가 바뀌면 애니메이션이 다시 실행된다.
      */}
      <p key={index} className="ll-message">
        {LETTER_LOADING.messages[index]}
      </p>

      <div className="ll-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
