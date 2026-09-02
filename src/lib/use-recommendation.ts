"use client";

/**
 * AI 추천 요청 관리.
 *
 * 종이접기 시점에 요청을 시작해 두고, 게임이 끝나 편지를 열 때 결과를 쓴다.
 * 참여자가 접기와 게임을 하는 동안 뒤에서 진행되므로 대부분 기다림이 없다.
 *
 * 요청은 회차당 한 번만 시작한다. 라운드 1은 무제한 재시도라서
 * 발사마다 부르면 한 사람이 수십 번 호출하게 된다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecommendPick } from "@/lib/recommend/engine";

/** 추천 진행 상태 */
export type RecommendState =
  /** 아직 시작하지 않음 */
  | "idle"
  /** 생성 중 */
  | "pending"
  /** 완료 */
  | "ready"
  /** 재시도까지 실패 */
  | "failed"
  /** 최대 대기 시간을 넘김 */
  | "timeout";

export interface Recommendation {
  letter: string;
  picks: RecommendPick[];
}

/** 결과를 기다리는 최대 시간. 이후에는 안내 문구로 넘긴다. */
const MAX_WAIT_MS = 25_000;

export function useRecommendation() {
  const [state, setState] = useState<RecommendState>("idle");
  const [data, setData] = useState<Recommendation | null>(null);

  /** 이미 시작한 회차. 중복 요청을 막는다. */
  const startedForRef = useRef<string | null>(null);
  /** 요청이 시작된 시각. 대기 시간 계산에 쓴다. */
  const startedAtRef = useRef<number>(0);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(timeoutRef.current);
  }, []);

  /**
   * 추천 요청을 시작한다. 같은 회차로 여러 번 불러도 한 번만 실행된다.
   *
   * 실패해도 게임 진행을 막지 않는다. 경품과 참여 기록은 이미 서버가
   * 따로 관리하므로 추천 실패가 참여에 영향을 주지 않는다.
   */
  const start = useCallback((attemptId: string) => {
    if (!attemptId || startedForRef.current === attemptId) return;
    startedForRef.current = attemptId;
    startedAtRef.current = Date.now();
    setState("pending");
    setData(null);

    void (async () => {
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId }),
        });

        if (!res.ok) {
          setState("failed");
          return;
        }

        const json = (await res.json()) as {
          status: string;
          letter?: string;
          picks?: RecommendPick[];
        };

        if (json.status === "ready" && json.letter) {
          setData({ letter: json.letter, picks: json.picks ?? [] });
          setState("ready");
        } else {
          setState("failed");
        }
      } catch (e) {
        console.error("[추천] 요청 중 오류", e);
        setState("failed");
      }
    })();
  }, []);

  /**
   * 결과 화면에 진입했음을 알린다.
   *
   * 아직 생성 중이면 남은 시간만큼 기다리고, 최대 대기 시간을 넘기면
   * timeout으로 바꿔 안내 문구를 띄운다. 요청 시작 시점부터 계산하므로
   * 게임하는 동안 흐른 시간이 이미 반영된다.
   */
  const beginWaiting = useCallback(() => {
    window.clearTimeout(timeoutRef.current);
    const elapsed = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, MAX_WAIT_MS - elapsed);

    timeoutRef.current = window.setTimeout(() => {
      // 그 사이에 도착했으면 건드리지 않는다
      setState((s) => (s === "pending" ? "timeout" : s));
    }, remaining);
  }, []);

  /**
   * 실패·시간초과 후 다시 확인한다.
   *
   * 서버는 이미 만들어 둔 결과가 있으면 Gemini를 부르지 않고 그것을 돌려준다.
   * 그래서 생성이 늦게 끝난 경우에도 이 버튼으로 결과를 받을 수 있다.
   */
  const retry = useCallback(() => {
    const attemptId = startedForRef.current;
    if (!attemptId) return;
    startedForRef.current = null;
    start(attemptId);
  }, [start]);

  /**
   * 서버에 저장해 둔 결과를 되살린다.
   *
   * 재접속해서 지난 결과를 다시 볼 때 쓴다. Gemini를 다시 부르지 않으므로
   * 처음 봤던 답장과 명소가 그대로 나온다.
   */
  const restore = useCallback(
    (saved: {
      attemptId: string;
      letter: string | null;
      picks: unknown;
      status: string | null;
    }) => {
      window.clearTimeout(timeoutRef.current);
      /*
       * 어느 회차의 결과인지 기억해 둔다.
       * 이 값이 없으면 "다시 확인하기" 버튼이 아무 일도 하지 못한다.
       */
      startedForRef.current = saved.attemptId;
      startedAtRef.current = Date.now();

      if (saved.letter && Array.isArray(saved.picks)) {
        setData({
          letter: saved.letter,
          picks: saved.picks as RecommendPick[],
        });
        setState("ready");
        return;
      }

      /*
       * 저장된 결과가 없는 경우다. 두 가지로 나뉜다.
       *  - 생성 중이던 회차: 아직 만들어지고 있을 수 있다
       *  - 실패했던 회차: 다시 확인 버튼을 보여준다
       */
      setData(null);
      setState(saved.status === "pending" ? "pending" : "failed");
    },
    [],
  );

  return { state, data, start, beginWaiting, retry, restore };
}
