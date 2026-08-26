/**
 * 소원 유형 선택 화면. (요구사항 3.1~3.5)
 * 시안의 s-cat 섹션. 2열 그리드에 6개 유형.
 */

import { CATEGORIES, type CategoryId } from "@/content/categories";
import { CATEGORY_SCREEN } from "@/content/copy";

export interface CategoryScreenProps {
  active: boolean;
  selected: CategoryId | null;
  onSelect(id: CategoryId): void;
  onNext(): void;
}

export function CategoryScreen({
  active,
  selected,
  onSelect,
  onNext,
}: CategoryScreenProps) {
  return (
    <section className="screen" data-active={active}>
      <div className="eyebrow">{CATEGORY_SCREEN.eyebrow}</div>
      <h2 className="title-md">{CATEGORY_SCREEN.title}</h2>
      <p className="lead" style={{ marginTop: 10 }}>
        {CATEGORY_SCREEN.lead}
      </p>

      <div className="cat-grid" role="radiogroup" aria-label={CATEGORY_SCREEN.title}>
        {CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.id}
            role="radio"
            aria-checked={selected === c.id}
            className={`cat-item ${selected === c.id ? "sel" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <span className="cat-emo" aria-hidden="true">
              {c.emoji}
            </span>
            <span className="cat-name">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="spacer" />

      <div className="bottom">
        <button
          type="button"
          className="btn"
          disabled={selected === null}
          onClick={onNext}
        >
          {CATEGORY_SCREEN.nextButton}
        </button>
      </div>
    </section>
  );
}
