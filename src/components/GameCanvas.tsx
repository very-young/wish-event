"use client";

/**
 * 게임 캔버스 컴포넌트. (요구사항 7.1, 7.2, 7.10, 14.4, 14.5, 14.10)
 *
 * 마우스와 터치 입력을 지원한다. 키보드 조작은 제공하지 않는다
 * (기획 결정: 마우스·터치로만 참여).
 *
 * 엔진에 입력을 전달하고 화면 크기 변화를 알리는 역할만 하며,
 * 게임 규칙은 엔진이 담당한다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine, type EngineEvents, type Phase } from "@/game/engine";
import { toVirtual, type Vec2 } from "@/game/coords";
import { resizeCanvas } from "@/game/render";
import type { InputLog } from "@/game/replay";
import { GAME_SCREEN } from "@/content/copy";
import { TOTAL_ROUNDS } from "@/game/config";

export interface GameCanvasProps {
  roundSeeds: readonly number[];
  onEnd(success: boolean, log: InputLog): void;
}

export function GameCanvas({ roundSeeds, onEnd }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState<string>(GAME_SCREEN.roundLabels[0]);
  const [showAimHint, setShowAimHint] = useState(true);

  // onEnd가 매 렌더마다 바뀌어도 엔진을 재생성하지 않도록 ref에 담는다
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const events: EngineEvents = {
      onRoundStart(r) {
        setRound(r);
        setMessage(GAME_SCREEN.roundLabels[r - 1] ?? "");
        setShowAimHint(true);
      },
      onHit(r, isFinal) {
        setMessage(
          isFinal
            ? GAME_SCREEN.finalHitMessage
            : (GAME_SCREEN.hitMessages[r - 1] ?? ""),
        );
        setShowAimHint(false);
      },
      onMiss(_r, by, canRetry) {
        if (canRetry) {
          // 라운드 1: 위로 문구를 순환 사용 (요구사항 8.12)
          const idx = (engineRef.current?.getMissCount() ?? 1) - 1;
          const msgs = GAME_SCREEN.round1MissMessages;
          setMessage(msgs[idx % msgs.length]);
        } else if (by === "cloud") {
          setMessage(GAME_SCREEN.missByCloud);
        } else if (by === "jet") {
          setMessage(GAME_SCREEN.missByJet);
        } else {
          setMessage(GAME_SCREEN.missByOut);
        }
        setShowAimHint(false);
      },
      onEnd(success, log) {
        onEndRef.current(success, log);
      },
      onPhaseChange(p) {
        setPhase(p);
        if (p === "aiming") setShowAimHint(false);
        if (p === "ready") setShowAimHint(true);
      },
    };

    const engine = new GameEngine({
      canvas,
      ctx,
      roundSeeds,
      events,
      reducedMotion,
    });
    engineRef.current = engine;

    const vp = resizeCanvas(canvas, ctx);
    engine.start(vp);

    // 화면 크기 변화에 대응 (요구사항 14.4)
    const observer = new ResizeObserver(() => {
      engine.setViewport(resizeCanvas(canvas, ctx));
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      engine.stop();
      engineRef.current = null;
    };
  }, [roundSeeds]);

  /** 이벤트 좌표를 가상 좌표로 변환 */
  const toGamePos = useCallback((clientX: number, clientY: number): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return toVirtual(
      { x: clientX - rect.left, y: clientY - rect.top },
      { width: rect.width, height: rect.height },
    );
  }, []);

  // ---------- 포인터 입력 (마우스 + 터치 통합) ----------

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const pos = toGamePos(e.clientX, e.clientY);
    if (engine.pointerDown(pos)) {
      // 손가락이 캔버스 밖으로 나가도 조준이 끊기지 않게 한다
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    engineRef.current?.pointerMove(toGamePos(e.clientX, e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    engine.pointerUp();
  };

  const handlePointerCancel = () => {
    engineRef.current?.cancelAim();
  };

  return (
    <div className="game-wrap">
      <div className="game-hud">
        <span className="round-badge">
          {GAME_SCREEN.roundNames[round - 1] ?? ""}
        </span>
        <span className="round-dots" aria-hidden="true">
          {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
            <i key={i} className={i < round - 1 ? "on" : ""} />
          ))}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label={`종이비행기 발사 게임. ${GAME_SCREEN.roundNames[round - 1] ?? ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />

      {/* 게임 상태를 텍스트로도 제공 */}
      <p className="game-message" aria-live="polite">
        {message}
      </p>

      {showAimHint && phase === "ready" && (
        <p className="game-aim-hint">{GAME_SCREEN.aimHint}</p>
      )}
    </div>
  );
}
