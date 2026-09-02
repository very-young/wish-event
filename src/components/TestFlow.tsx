"use client";

/**
 * 테스트용 참여 흐름. (내부 검수용)
 *
 * 실제 화면과 같은 컴포넌트를 쓰므로 여기서 확인한 모습이 실제와 일치한다.
 * 다만 서버를 거치지 않아 참여 기록·경품 재고·일련번호를 건드리지 않는다.
 *
 * ⚠️ 이 파일의 판정은 검수 편의를 위한 것이며 경품 지급 근거가 아니다.
 *    실제 참여에서는 서버가 입력 로그를 재현해 판정한다 (설계 결정 D1).
 */

import { useCallback, useState } from "react";
import { StarField } from "./StarField";
import { GameCanvas } from "./GameCanvas";
import { IntroScreen } from "./screens/IntroScreen";
import { CategoryScreen } from "./screens/CategoryScreen";
import { WriteScreen } from "./screens/WriteScreen";
import { FoldScreen } from "./screens/FoldScreen";
import { CelebrateScreen } from "./screens/CelebrateScreen";
import { LetterScreen } from "./screens/LetterScreen";
import { CATEGORIES, type CategoryId } from "@/content/categories";
import { createRoundSeeds, createRng } from "@/game/rng";
import { TOTAL_ROUNDS } from "@/game/config";
import type { RecommendPick } from "@/lib/recommend/engine";
import type { RecommendState } from "@/lib/use-recommendation";

type Step =
  | "intro"
  | "category"
  | "write"
  | "fold"
  | "game"
  | "celebrate"
  | "letter";

/** 표시용 가짜 일련번호. 실제 100개 목록에서 꺼내지 않는다. */
const FAKE_SERIAL = "TEST-0000";

export function TestFlow() {
  const [step, setStep] = useState<Step>("intro");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [wish, setWish] = useState("");
  const [seeds, setSeeds] = useState<number[]>([]);
  const [gameKey, setGameKey] = useState(0);

  const [won, setWon] = useState(false);
  const [prizeSoldOut, setPrizeSoldOut] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ---------- 테스트 설정 ----------

  /** 달을 크고 느리게. 라운드 3 성공 화면을 보기 위한 것 */
  const [easyMode, setEasyMode] = useState(true);
  /** 경품 소진 상황을 재현한다 */
  const [simulateSoldOut, setSimulateSoldOut] = useState(false);
  /** AI 추천을 실제로 부를지, 화면만 볼지 */
  const [useRealAi, setUseRealAi] = useState(false);

  // ---------- AI 추천 ----------

  const [aiState, setAiState] = useState<RecommendState>("ready");
  const [aiLetter, setAiLetter] = useState<string | undefined>();
  const [aiPicks, setAiPicks] = useState<RecommendPick[] | undefined>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  /*
   * AI 추천 시험 호출.
   *
   * 로그인이 없으므로 실제 API(/api/recommend)는 쓸 수 없다.
   * 대신 시험용 경로를 부른다. 회차를 만들지 않으므로 DB에 기록되지 않는다.
   */
  const requestAi = useCallback(
    async (cat: CategoryId, text: string) => {
      if (!useRealAi) {
        // 화면 확인만 할 때는 예시 문구를 쓴다
        setAiState("ready");
        setAiLetter(undefined);
        setAiPicks(undefined);
        return;
      }

      setAiState("pending");
      setAiLetter(undefined);
      setAiPicks(undefined);

      const label = CATEGORIES.find((c) => c.id === cat)?.label ?? "";
      try {
        const res = await fetch("/api/recommend/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: label, wish: text }),
        });
        if (!res.ok) {
          setAiState("failed");
          return;
        }
        const json = (await res.json()) as {
          letter?: string;
          picks?: RecommendPick[];
        };
        if (json.letter) {
          setAiLetter(json.letter);
          setAiPicks(json.picks ?? []);
          setAiState("ready");
        } else {
          setAiState("failed");
        }
      } catch {
        setAiState("failed");
      }
    },
    [useRealAi],
  );

  // ---------- 흐름 ----------

  /** seed는 매번 새로 만들어 같은 궤적이 반복되지 않게 한다 */
  const freshSeeds = () => {
    const rng = createRng(Date.now() % 0xffffffff);
    return createRoundSeeds(() => rng.next(), TOTAL_ROUNDS);
  };

  const handleWishSubmit = () => {
    if (!category) return;
    setSeeds(freshSeeds());
    setGameKey((k) => k + 1);
    void requestAi(category, wish);
    setStep("fold");
  };

  const handleGameEnd = useCallback(
    (success: boolean) => {
      if (success) {
        setWon(true);
        setPrizeSoldOut(simulateSoldOut);
        setStep("celebrate");
      } else {
        setWon(false);
        setPrizeSoldOut(false);
        setStep("letter");
      }
    },
    [simulateSoldOut],
  );

  /** 게임만 다시. 소원은 유지한다 (재도전 흐름과 같다) */
  const replayGame = () => {
    setSeeds(freshSeeds());
    setGameKey((k) => k + 1);
    setWon(false);
    setPrizeSoldOut(false);
    setStep("game");
  };

  /** 처음부터 다시 */
  const restart = () => {
    setCategory(null);
    setWish("");
    setWon(false);
    setPrizeSoldOut(false);
    setAiState("ready");
    setAiLetter(undefined);
    setAiPicks(undefined);
    setStep("intro");
  };

  /** 게임을 건너뛰고 결과를 바로 본다 */
  const jumpToResult = (success: boolean) => {
    if (!category) {
      showToast("소원 유형을 먼저 골라주세요");
      return;
    }
    setWon(success);
    setPrizeSoldOut(success && simulateSoldOut);
    setStep(success ? "celebrate" : "letter");
  };

  return (
    <main className="stage">
      <StarField />

      <IntroScreen
        active={step === "intro"}
        // 로그인 없이 바로 시작한다
        signedIn
        onStart={() => setStep("category")}
      />

      <CategoryScreen
        active={step === "category"}
        selected={category}
        onSelect={setCategory}
        onNext={() => setStep("write")}
      />

      <WriteScreen
        active={step === "write"}
        category={category}
        value={wish}
        onChange={setWish}
        onNext={handleWishSubmit}
      />

      {step === "fold" && <FoldScreen onComplete={() => setStep("game")} />}

      {step === "game" && seeds.length > 0 && (
        <section className="screen" data-active="true" style={{ padding: 0 }}>
          <GameCanvas
            key={gameKey}
            roundSeeds={seeds}
            easyMode={easyMode}
            onEnd={handleGameEnd}
          />
        </section>
      )}

      {step === "celebrate" && (
        <CelebrateScreen
          prizeSoldOut={prizeSoldOut}
          onNext={() => setStep("letter")}
        />
      )}

      {step === "letter" && (
        <LetterScreen
          category={category}
          won={won}
          prizeSoldOut={prizeSoldOut}
          serial={won && !prizeSoldOut ? FAKE_SERIAL : null}
          aiState={aiState}
          aiLetter={aiLetter}
          aiPicks={aiPicks}
          // 테스트에서는 공유 없이 바로 재도전한다
          onShareRetry={() => {
            showToast("테스트: 공유 없이 재도전합니다");
            replayGame();
          }}
          onShareInvite={() => showToast("테스트: 공유는 동작하지 않아요")}
          onNotify={showToast}
        />
      )}

      {/* 테스트 조작 막대. 실제 화면에는 없다. */}
      <div className="preview-bar">
        <div className="preview-row">
          <button
            type="button"
            className={easyMode ? "preview-btn on" : "preview-btn"}
            onClick={() => setEasyMode((v) => !v)}
          >
            {easyMode ? "쉬운 난이도 ON" : "쉬운 난이도 OFF"}
          </button>
          <button
            type="button"
            className={simulateSoldOut ? "preview-btn on" : "preview-btn"}
            onClick={() => setSimulateSoldOut((v) => !v)}
          >
            {simulateSoldOut ? "경품소진 ON" : "경품소진 OFF"}
          </button>
          <button
            type="button"
            className={useRealAi ? "preview-btn on" : "preview-btn"}
            onClick={() => setUseRealAi((v) => !v)}
          >
            {useRealAi ? "AI 실제호출 ON" : "AI 실제호출 OFF"}
          </button>
        </div>

        <div className="preview-row">
          <button type="button" className="preview-btn" onClick={restart}>
            처음부터
          </button>
          {(step === "letter" || step === "celebrate") && (
            <button type="button" className="preview-btn" onClick={replayGame}>
              게임 다시
            </button>
          )}
          <button
            type="button"
            className="preview-btn"
            onClick={() => jumpToResult(true)}
          >
            성공 결과로
          </button>
          <button
            type="button"
            className="preview-btn"
            onClick={() => jumpToResult(false)}
          >
            실패 결과로
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
