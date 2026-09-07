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
        /*
         * 화면 대기 시간이 끝났다. 티켓은 아직 유효할 수 있다.
         *
         * 서버는 만료된 티켓만 정리하므로, 참여자가 지금 카카오톡에서
         * 전송을 마치면 그 공유는 여전히 인정된다.
         * 그래서 "실패"가 아니라 "확인이 늦어진다"로 안내한다.
         */
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

  /*
   * ⚠️ 페이지를 벗어날 때 티켓을 만료시키지 않는다.
   *
   * 공유 버튼을 누르면 카카오톡 앱이 열리면서 브라우저가 뒤로 밀려난다.
   * 그때 pagehide가 발생하는데, 여기서 티켓을 만료시키면
   * **참여자가 친구에게 전송을 완료해도 재도전이 열리지 않는다.**
   * 정당한 공유가 무효가 되는 것이 갇혀서 잠시 못 하는 것보다 나쁘다.
   *
   * 갇히는 문제는 서버가 해결한다. 다음 공유 시도에서 만료된 티켓을
   * 정리하므로 저절로 풀린다 (0013 마이그레이션).
   */

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
        {/* 줄바꿈이 문구에 포함돼 있으므로 그대로 살려 표시한다 */}
        <p
          className="lead"
          style={{ marginTop: 10, whiteSpace: "pre-line" }}
        >
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
