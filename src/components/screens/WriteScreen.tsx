/**
 * 소원 작성 화면. (요구사항 4.1~4.7, 5.1~5.3)
 * 시안의 s-write 섹션. 줄무늬 종이에 손글씨 느낌으로 적는다.
 */

import { getCategory, type CategoryId } from "@/content/categories";
import { COMMON, MODERATION, WRITE_SCREEN } from "@/content/copy";
import { WISH_TEXT_LIMIT } from "@/content/settings";
import { checkWishText } from "@/lib/moderation";

export interface WriteScreenProps {
  active: boolean;
  category: CategoryId | null;
  value: string;
  /** 서버 처리 중이면 버튼을 잠근다 */
  busy?: boolean;
  onChange(value: string): void;
  onNext(): void;
}

export function WriteScreen({
  active,
  category,
  value,
  busy = false,
  onChange,
  onNext,
}: WriteScreenProps) {
  const cat = category ? getCategory(category) : undefined;
  const check = checkWishText(value);
  const trimmedLength = value.trim().length;

  // 사용자가 입력을 시작한 뒤에만 문제를 알린다
  const showIssue = trimmedLength > 0 && !check.ok;

  const issueText = (() => {
    if (!showIssue) return null;
    switch (check.reason) {
      case "tooShort":
        return WRITE_SCREEN.tooShort;
      case "blank":
        return WRITE_SCREEN.blankOnly;
      case "bannedWord":
        return MODERATION.bannedWord;
      case "personalInfo":
        return MODERATION.personalInfo;
      case "notAWish":
        return MODERATION.notAWish;
      default:
        return null;
    }
  })();

  return (
    <section className="screen" data-active={active}>
      <div className="eyebrow">{cat?.eyebrow ?? "소원 적기"}</div>
      <h2 className="title-md">
        {WRITE_SCREEN.title.split("\n").map((line, i) => (
          <span key={i}>
            {line}
            {i === 0 && <br />}
          </span>
        ))}
      </h2>

      <div style={{ marginTop: 22 }}>
        <div className="paper">
          <span className="paper-tag">{cat?.paperTag ?? "소원 편지"}</span>
          <label className="sr-only" htmlFor="wish-text">
            소원 내용
          </label>
          <textarea
            id="wish-text"
            className="paper-input"
            maxLength={WISH_TEXT_LIMIT.max}
            placeholder={WRITE_SCREEN.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="paper-count" aria-live="polite">
            {value.length} / {WISH_TEXT_LIMIT.max}
          </span>
        </div>

        {issueText && (
          <p className="input-issue" role="alert">
            {issueText}
          </p>
        )}
      </div>

      <div className="spacer" />

      <div className="bottom">
        <button
          type="button"
          className="btn"
          disabled={!check.ok || busy}
          onClick={onNext}
        >
          {busy ? COMMON.loading : WRITE_SCREEN.nextButton}
        </button>
      </div>
    </section>
  );
}
