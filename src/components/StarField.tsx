/**
 * 배경 별 반짝임. (요구사항 1.2)
 *
 * 시안은 48개를 무작위 위치에 뿌린다. 여기서는 고정 seed로 생성해
 * 서버와 클라이언트가 같은 결과를 내게 한다. 무작위 함수를 쓰면
 * 두 결과가 어긋나 화면이 깜빡이거나 경고가 발생한다.
 *
 * 장식 요소라 동작 축소 설정에서는 숨긴다.
 */

import { createRng } from "@/game/rng";

const STAR_COUNT = 48;
/** 고정 seed. 별 배치는 매번 같아도 무방하다. */
const STAR_SEED = 0x5eed_5747;

interface Star {
  left: number;
  top: number;
  size: number;
  delay: number;
}

const STARS: readonly Star[] = (() => {
  const rng = createRng(STAR_SEED);
  return Array.from({ length: STAR_COUNT }, () => ({
    left: rng.range(0, 100),
    top: rng.range(0, 70),
    size: rng.range(1, 3),
    delay: rng.range(0, 3),
  }));
})();

export function StarField() {
  return (
    <div className="star-field decorative" aria-hidden="true">
      {STARS.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
