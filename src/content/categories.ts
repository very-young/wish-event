/**
 * 소원 유형과 명소 데이터. (요구사항 3.1, 11.6)
 *
 * TODO: 명소 자료는 전부 자리표시자다. 실제 자료(이름·소개·이미지)를
 *       받으면 이 파일만 교체하면 된다 (요구사항 11.10).
 *       유형별로 3곳보다 많이 등록하면 그중 3곳을 무작위 선택한다 (11.7).
 */

/** 소원 유형 식별자. DB에 저장되는 값이므로 변경 시 마이그레이션 필요. */
export type CategoryId =
  | "health"
  | "study"
  | "love"
  | "wealth"
  | "career"
  | "family";

export interface Place {
  /** 명소 이름 */
  name: string;
  /** 소개 문구 */
  description: string;
  /**
   * 이미지 경로. 비어 있으면 emoji 타일로 대체 표시한다.
   * TODO: 실제 이미지 배치 후 채운다.
   */
  image?: string;
  /** 이미지가 없을 때 쓰는 대체 아이콘 */
  emoji: string;
  /**
   * 만끽지도 상세 페이지 주소.
   *
   * 없으면 화면은 링크 없이 이름만 보여준다.
   * 결과를 저장할 때 함께 넣어두므로 재접속 시에도 유지된다.
   */
  link?: string;
}

export interface Category {
  id: CategoryId;
  /** 화면에 표시할 유형 이름 */
  label: string;
  /** 유형 상징 아이콘 */
  emoji: string;
  /** 소원 작성 화면 상단 문구 */
  eyebrow: string;
  /** 소원 종이에 붙는 라벨 */
  paperTag: string;
  /** 추천 명소 목록 (3곳 이상 권장) */
  places: Place[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: "health",
    label: "건강·무탈",
    emoji: "🍀",
    eyebrow: "건강을 비는 밤",
    paperTag: "건강 소원",
    places: [
      {
        name: "장수마을 편백숲",
        description: "피톤치드 가득한 숲길, 몸과 마음이 맑아져요.",
        emoji: "🍀",
      },
      {
        name: "약수 온천지",
        description: "예부터 몸을 낫게 한다 전해지는 온천 명소.",
        emoji: "♨️",
      },
      {
        name: "무병장수 봉우리",
        description: "천천히 오르며 건강을 기원하는 완만한 능선.",
        emoji: "⛰️",
      },
    ],
  },
  {
    id: "study",
    label: "성장·학업",
    emoji: "📖",
    eyebrow: "배움을 비는 밤",
    paperTag: "학업 소원",
    places: [
      {
        name: "남한산성 서문",
        description: "옛 선비들이 뜻을 세우던 성곽길, 마음을 다잡기 좋아요.",
        emoji: "📖",
      },
      {
        name: "갓바위 기도처",
        description: "예로부터 소원 하나는 꼭 들어준다 전해지는 명소.",
        emoji: "⛩️",
      },
      {
        name: "선비촌 소나무길",
        description: "맑은 새벽 공기 속에서 결심을 되새기는 산책로.",
        emoji: "🌲",
      },
    ],
  },
  {
    id: "love",
    label: "사랑·인연",
    emoji: "💕",
    eyebrow: "사랑을 비는 밤",
    paperTag: "인연 소원",
    places: [
      {
        name: "월하정인 언덕",
        description: "달빛 아래 인연이 이어진다는 낭만의 명소.",
        emoji: "💕",
      },
      {
        name: "벚꽃 실개천길",
        description: "봄이면 연인들이 손잡고 걷는 분홍빛 산책로.",
        emoji: "🌸",
      },
      {
        name: "사랑의 종탑",
        description: "둘이 종을 울리면 마음이 통한다는 전설의 장소.",
        emoji: "🔔",
      },
    ],
  },
  {
    id: "wealth",
    label: "재물·자산",
    emoji: "🪙",
    eyebrow: "풍요를 비는 밤",
    paperTag: "재물 소원",
    places: [
      {
        name: "금정산 복샘",
        description: "물 한 모금에 복이 깃든다는 오래된 약수터.",
        emoji: "🪙",
      },
      {
        name: "재물사 돌탑",
        description: "동전을 올리며 풍요를 기원하던 전통 기도터.",
        emoji: "🏛️",
      },
      {
        name: "황금빛 노을 해변",
        description: "해질녘 금빛 바다를 바라보며 부를 기원해요.",
        emoji: "🌊",
      },
    ],
  },
  {
    id: "career",
    label: "이직·취업",
    emoji: "🧭",
    eyebrow: "새 길을 비는 밤",
    paperTag: "취업 소원",
    places: [
      {
        name: "첫걸음 등대길",
        description: "새로운 항로를 밝혀준다는 바닷가 등대 산책로.",
        emoji: "🧭",
      },
      {
        name: "개운사 문턱",
        description: "막힌 길이 열린다 전해지는 오래된 기도처.",
        emoji: "🗝️",
      },
      {
        name: "해맞이 언덕",
        description: "새 출발을 다짐하기 좋은 일출 명소.",
        emoji: "🌅",
      },
    ],
  },
  {
    id: "family",
    label: "효도·가족",
    emoji: "🏡",
    eyebrow: "가족을 비는 밤",
    paperTag: "가족 소원",
    places: [
      {
        name: "한옥마을 마당",
        description: "온 가족이 둘러앉기 좋은 정겨운 전통 공간.",
        emoji: "🏡",
      },
      {
        name: "보름달 전망대",
        description: "가족과 함께 추석 보름달을 바라보기 좋은 곳.",
        emoji: "🎑",
      },
      {
        name: "명절 장터거리",
        description: "손잡고 거닐며 추억을 나누는 시끌벅적 장터.",
        emoji: "🍚",
      },
    ],
  },
] as const;

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return CATEGORY_MAP.get(id as CategoryId);
}

export function isValidCategoryId(id: string): id is CategoryId {
  return CATEGORY_MAP.has(id as CategoryId);
}
