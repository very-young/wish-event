"use client";

/**
 * 공유 대기 화면. (요구사항 12.4, 12.13, 12.20)
 *
 * 카카오톡 전송 완료를 기다린다. 전송이 확인되면 서버가 참여 상태를
 * retry_ready로 바꾸므로, 그 변화를 주기적으로 확인한다.
 *
 * 실시간 구독 대신 폴링을 쓴다. 대기 시간이 60초로 짧고, 폴링이
 * 연결 실패 걱정 없이 확실하게 동작하기 때문이다.
 */

import { useEffect, useRef, useState } from "react";
import { expireShareWait, getPlayState } from "@/app/actions";
import { RETRY_SHARE } from "@/content/copy";
import {
  SHARE_POLL_INTERVAL_MS,
  SHARE_WAIT_TIMEOUT_MS,
} from "@/content/settings";

export interface ShareWaitOverlayProps {
  /** 재도전이 열렸을 때 */
  onGranted(): void;
  /** 시간 초과 또는 사용자가 닫았을 때 */
  onCancel(reason: "timeout" | "closed"): void;
}

export function ShareWaitOverlay({
  onGranted,
  onCancel,
}: ShareWaitOverlayProps) {
  const [secondsLeft, setSecondsLeft] = useState(
    Math.floor(SHARE_WAIT_TIMEOUT_MS / 1000),
  );
  // 콜백이 두 번 불리지 않게 막는다
  const settledRef = useRef(false);

  useEffect(() => {
    const deadline = Date.now() + SHARE_WAIT_TIMEOUT_MS;
    let pollTimer: number | undefined;

    const settle = (fn: () => void) => {
      if (settledRef.current) return;
      settledRef.current = true;
      window.clearTimeout(pollTimer);
      window.clearInterval(tickTimer);
      fn();
    };

    const poll = async () => {
      if (settledRef.current) return;

      try {
        const state = await getPlayState();
        if (state.ok && state.state === "retry_ready") {
          settle(onGranted);
          return;
        }
      } catch {
        // 조회 실패는 무시하고 다음 주기에 다시 시도한다
      }

      if (Date.now() >= deadline) {
        // 시간 초과: 상태를 되돌려 다시 공유할 수 있게 한다
        void expireShareWait();
        settle(() => onCancel("timeout"));
        return;
      }

      pollTimer = window.setTimeout(poll, SHARE_POLL_INTERVAL_MS);
    };

    const tickTimer = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);

    pollTimer = window.setTimeout(poll, SHARE_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(pollTimer);
      window.clearInterval(tickTimer);
    };
  }, [onGranted, onCancel]);

  const handleClose = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    void expireShareWait();
    onCancel("closed");
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="공유 확인 대기"
    >
      <div className="modal-card share-wait">
        <div className="share-wait-spinner" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <p className="title-md" style={{ fontSize: 19 }}>
          {RETRY_SHARE.waiting}
        </p>
        <p className="lead" style={{ marginTop: 10 }}>
          {RETRY_SHARE.waitingSub}
        </p>

        <p className="share-wait-timer" aria-live="off">
          {secondsLeft}초
        </p>

        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 18 }}
          onClick={handleClose}
        >
          그만두기
        </button>
      </div>
    </div>
  );
}
