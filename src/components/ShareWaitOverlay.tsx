"use client";

/**
 * 공유 대기 화면. (요구사항 12.4, 12.13, 12.20)
 *
 * 카카오톡 전송 완료를 기다린다. 전송이 확인되면 서버가 참여 상태를
 * retry_ready로 바꾸므로, 그 변화를 주기적으로 확인한다.
 *
 * 실시간 구독 대신 폴링을 쓴다. 대기 시간이 짧고, 폴링이 연결 실패
 * 걱정 없이 확실하게 동작하기 때문이다.
 */

import { useEffect, useRef } from "react";
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
  // 콜백이 두 번 불리지 않게 막는다
  const settledRef = useRef(false);

  useEffect(() => {
    const deadline = Date.now() + SHARE_WAIT_TIMEOUT_MS;
    let pollTimer: number | undefined;

    const settle = (fn: () => void) => {
      if (settledRef.current) return;
      settledRef.current = true;
      window.clearTimeout(pollTimer);
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
         * 화면 대기 시간이 끝났다. 티켓을 정리하고 상태를 되돌린다.
         *
         * 이 뒤에 카카오톡에서 전송을 마쳐도 그 공유는 인정되지 않는다.
         * 참여자는 공유하기를 다시 눌러야 한다. 다시 누르면 새 티켓이
         * 나오므로 막히지는 않는다 (0013 마이그레이션).
         */
        void expireShareWait();
        settle(() => onCancel("timeout"));
        return;
      }

      pollTimer = window.setTimeout(poll, SHARE_POLL_INTERVAL_MS);
    };

    pollTimer = window.setTimeout(poll, SHARE_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(pollTimer);
    };
  }, [onGranted, onCancel]);

  /*
   * ⚠️ 페이지를 벗어날 때(pagehide) 아무것도 하지 않는다.
   *
   * 공유 버튼을 누르면 카카오톡 앱이 열리면서 브라우저가 뒤로 밀려나
   * 그때 pagehide가 발생한다. 여기서 티켓을 만료시키면
   * **참여자가 친구에게 전송을 완료해도 재도전이 열리지 않는다.**
   * 공유를 시작하는 순간 그 공유가 무효가 되는 셈이다.
   *
   * 그래서 강제로 창을 닫으면 상태가 retry_pending에 남는다. 그 문제는
   * 서버가 해결한다. 공유 버튼을 다시 누르면 새 티켓이 나온다
   * (0013 마이그레이션).
   */

  /*
   * 그만두기. 서버에 대기 종료를 알려 상태를 되돌린다.
   * 되돌린 뒤에도 공유 버튼은 바로 다시 누를 수 있다.
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

        {/*
          남은 시간을 숫자로 보여주지 않는다.
          줄어드는 숫자는 "이 안에 끝내야 한다"는 압박을 줘서
          친구를 고르는 동안 조급하게 만든다.
          위의 점 세 개 애니메이션이 기다리는 중임을 알려준다.
        */}

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
