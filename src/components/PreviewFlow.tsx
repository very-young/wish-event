"use client";

/**
 * 결과 화면 미리보기. (개발·검수용)
 *
 * 실제 게임을 거치지 않고 성공·실패 결과 화면을 바로 확인한다.
 * 서버를 호출하지 않으므로 참여 기회, 일련번호, 경품 재고에 영향이 없다.
 *
 * 화면 자체는 실제와 같은 컴포넌트를 쓴다. 그래야 미리보기에서 확인한 모습이
 * 실제 화면과 일치한다.
 */

import { useState } from "react";
import { StarField } from "./StarField";
import { CelebrateScreen } from "./screens/CelebrateScreen";
import { LetterScreen } from "./screens/LetterScreen";
import { CATEGORIES, type CategoryId } from "@/content/categories";

/** 미리볼 상황 */
type Mode =
  /** 3라운드 성공 + 경품 당첨 */
  | "won"
  /** 3라운드 성공했지만 경품 소진 */
  | "soldOut"
  /** 도중 실패 */
  | "failed";

const MODE_LABELS: { mode: Mode; label: string }[] = [
  { mode: "won", label: "성공 + 당첨" },
  { mode: "soldOut", label: "성공 + 경품소진" },
  { mode: "failed", label: "실패" },
];

/** 미리보기용 가짜 일련번호. 실제 풀에서 꺼내지 않는다. */
const SAMPLE_SERIAL = "34CX-2KRW";

export function PreviewFlow() {
  const [mode, setMode] = useState<Mode>("won");
  const [step, setStep] = useState<"celebrate" | "letter">("celebrate");
  const [category, setCategory] = useState<CategoryId>(
    CATEGORIES[0].id as CategoryId,
  );
  const [toast, setToast] = useState<string | null>(null);

  const won = mode !== "failed";
  const prizeSoldOut = mode === "soldOut";

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  /** 상황을 바꾸면 축하 연출부터 다시 본다 */
  const pick = (next: Mode) => {
    setMode(next);
    // 실패는 축하 연출이 없다
    setStep(next === "failed" ? "letter" : "celebrate");
  };

  return (
    <main className="stage">
      <StarField />

      {step === "celebrate" && won && (
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
          // 당첨일 때만 일련번호가 있다
          serial={mode === "won" ? SAMPLE_SERIAL : null}
          onShareRetry={() => showToast("미리보기에서는 공유가 동작하지 않아요")}
          onShareInvite={() => showToast("미리보기에서는 공유가 동작하지 않아요")}
          onSaveImage={() => showToast("미리보기입니다")}
          onNotify={showToast}
        />
      )}

      {/* 미리보기 조작 막대. 실제 화면에는 없다. */}
      <div className="preview-bar">
        <div className="preview-row">
          {MODE_LABELS.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={m.mode === mode ? "preview-btn on" : "preview-btn"}
              onClick={() => pick(m.mode)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="preview-row">
          {/* 소원 유형에 따라 추천 명소가 달라지므로 함께 바꿔본다 */}
          <select
            className="preview-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryId)}
            aria-label="소원 유형"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          {won && (
            <button
              type="button"
              className="preview-btn"
              onClick={() => setStep("celebrate")}
            >
              축하 연출 다시
            </button>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
