/**
 * 화면 문구 모음.
 *
 * 문구 수정 시 이 파일만 고치면 된다.
 * TODO: 개인정보 안내 문구는 확정본으로 교체 필요 (요구사항 2.6).
 */

export const INTRO = {
  eyebrow: "추석 소원 이벤트",
  title: "잘 오셨어요,\n여기는 소원을 비는 달이에요",
  lead: "오늘 밤, 당신의 소원을 종이비행기에 실어\n저에게 날려 보내주세요.",
  startButton: "카카오로 시작하기",
  startButtonSignedIn: "소원 빌러 가기",
  periodLabel: "이벤트 기간",
} as const;

/** 참여가 차단된 상황별 안내 (요구사항 1.4, 1.5, 13.4, 13.7) */
export const BLOCKED = {
  beforeEvent: {
    title: "아직 달이 뜨지 않았어요",
    body: "이벤트 시작일에 다시 찾아와 주세요.",
  },
  afterEvent: {
    title: "이벤트가 끝났어요",
    body: "함께해 주셔서 고마워요. 다음에 또 만나요.",
  },
  noChance: {
    title: "오늘의 소원은 이미 전했어요",
    body: "내일 다시 소원을 빌 수 있어요.",
  },
  alreadyWon: {
    title: "이미 경품에 당첨되셨어요",
    body: "이벤트 기간 동안은 추가 참여가 어려워요. 친구에게 알려주는 건 언제든 가능해요.",
  },
} as const;

export const CATEGORY_SCREEN = {
  eyebrow: "소원 고르기",
  title: "어떤 마음을 담아 볼까요?",
  lead: "당신의 마음이 향하는 곳을 하나 골라주세요.",
  nextButton: "소원 적으러 가기",
  requireSelection: "소원 유형을 하나 골라주세요.",
} as const;

export const WRITE_SCREEN = {
  title: "달님에게 전할 소원을\n적어주세요",
  placeholder: "이곳에 소원을 적어보세요…\n진심일수록 더 잘 닿는대요.",
  nextButton: "종이 접기",
  tooShort: "소원을 조금만 더 적어주세요.",
  blankOnly: "소원 내용을 적어주세요.",
} as const;

/** 모더레이션 차단 안내 (요구사항 5.2, 5.3) */
export const MODERATION = {
  bannedWord: "적절하지 않은 표현이 있어요. 다시 적어주세요.",
  personalInfo:
    "연락처나 주소는 담을 수 없어요. 소원 내용만 적어주세요.",
} as const;

export const FOLD_SCREEN = {
  eyebrow: "종이비행기 접기",
  initialHint: "종이를 톡톡 두드려 비행기로 접어요",
  stepHints: [
    "반으로 접어요",
    "모서리를 맞춰 접어요",
    "날개 선을 잡아요",
    "날개를 펼쳐요",
    "완성!",
  ],
  readyHint: "달님에게 날려볼까요?",
} as const;

export const GAME_SCREEN = {
  roundNames: ["첫 번째 도전", "두 번째 도전", "세 번째 도전"],
  roundLabels: [
    "달님이 조용히 기다리고 있어요",
    "달님이 살며시 움직이기 시작했어요",
    "구름과 비행기 사이로, 달님이 쏜살같이 지나가요!",
  ],
  aimHint: "비행기를 끌어당겼다 놓아 날려보세요",
  /** 라운드 1 빗나감 위로 문구. 순환 사용해 반복을 피한다 (요구사항 8.12) */
  round1MissMessages: [
    "바람이 살짝 흔들렸나 봐요. 다시 한 번 🍃",
    "이번엔 될 거예요~ 마음을 담아 🌙",
    "달님도 기다리고 있어요. 천천히, 한 번 더!",
    "괜찮아요, 종이비행기는 원래 조금 까다롭거든요 ✨",
    "오늘 바람이 유난히 장난꾸러기네요~ 다시!",
  ],
  hitMessages: [
    "소원이 달님께 무사히 닿았어요 ✨",
    "이번에도 잘 닿았어요! 달님이 방긋 웃어요 🌕",
  ],
  finalHitMessage: "세 번의 도전을 모두 성공했어요 🌕✨",
  missByCloud: "앗, 구름에 부딪혀 길을 잃었어요…",
  missByJet: "앗, 비행기와 부딪혀 버렸어요…",
  missByOut: "이런, 소원이 밤바람에 흩날렸어요…",
} as const;

export const CELEBRATE = {
  badge: "🎉 짜잔!",
  title: "경품에 당첨됐어요!",
  body: "세 번의 도전을 모두 성공했어요.\n달님이 특별한 선물을 준비했대요 🎁",
  /** 경품 소진 시 (요구사항 10.3) */
  soldOutTitle: "세 번의 도전을 모두 성공했어요!",
  soldOutBody:
    "아쉽게도 준비된 경품이 모두 소진됐어요.\n하지만 당신의 소원은 달님에게 잘 닿았답니다.",
  autoNextHint: "달님의 답장이 도착하고 있어요…",
} as const;

export const LETTER = {
  /*
   * 편지 본문이 선물을 언급하지 않으므로 안내도 선물을 빼고 하나로 쓴다.
   * 경품 지급 안내는 편지 아래 "경품 받는 방법"에서 따로 한다.
   */
  arrivedWin: "달님이 답장을 보냈어요\n편지를 눌러 열어보세요",
  arrivedLose: "달님에게 답장이 왔어요\n편지를 눌러 열어보세요",
  from: "FROM. 달님",
  /*
   * 선물을 언급하지 않으므로 경품 소진 여부와 무관하게 쓸 수 있다.
   */
  bodyWin:
    "이렇게 정성껏 밤하늘을 건너온 소원은\n오랜만이에요.\n당신의 소원이 이루어지길 바라며\n어울리는 곳들을 적어 보내요.",
  /*
   * 줄바꿈은 읽기 리듬을 위해 의미 단위로 넣었다.
   * 화면에서 그대로 유지된다.
   */
  bodyLose:
    "종이비행기는 밤바람에 잠시 길을 잃었지만,\n당신의 간절한 마음은 제게 닿았어요.\n그 소원이 이루어지길 바라며\n어울리는 곳들을 적어 보내요.",
  placesEyebrow: "소원을 이룰 수 있는 곳",
  reviewButton: "결과 다시 보기",
} as const;

/** 재도전용 공유 (요구사항 12.1) */
export const RETRY_SHARE = {
  prompt:
    "아쉽다면 친구에게 공유해서\n달님께 소원을 한 번 더 전할 수 있어요.",
  button: "친구에게 공유하고 다시 도전하기",
  waiting: "카카오톡에서 친구를 선택해 공유해주세요.",
  waitingSub:
    "카카오톡으로 전송이 확인되면 재도전이 열려요.\n단, 이미 보낸 톡방과 나와의 채팅은 재도전이 열리지 않아요.",
  granted: "재도전 기회가 열렸어요! 🌙",
  startRetryButton: "다시 도전하기",
  duplicateRoom:
    "이미 보낸 톡방이에요. 다른 친구에게 보내면 다시 도전할 수 있어요.",
  memoChat:
    "나와의 채팅방은 재도전이 열리지 않아요. 친구에게 보내주세요.",
  timeout:
    "전송을 확인하지 못했어요. 다시 시도해 주세요.",
  failed: "공유를 실행하지 못했어요. 다시 시도해 주세요.",
  unavailable:
    "이 환경에서는 카카오톡 공유를 사용할 수 없어요. 재도전 기회를 받을 수 없습니다.",
} as const;

/** 친구에게 알리기 (성공 시, 요구사항 12.21~12.26) */
export const INVITE_SHARE = {
  button: "친구에게 알리기",
  notice: "친구에게 이벤트를 알려줄 수 있어요.",
  /** 공유 카드 문구. {nickname}이 닉네임으로 치환된다 (요구사항 12.24) */
  cardTitle: "{nickname}님이 달님에게 소원을 전했어요!",
  cardDescription:
    "추석 보름달에 소원을 빌어보세요. 종이비행기를 접어 달님에게 날려 보내는 이벤트예요.",
  cardButton: "나도 소원 빌어보기",
  done: "친구에게 이벤트를 알렸어요 ✨",
} as const;

/** 재도전용 공유 카드 문구. 보내는 사람의 실패 사실은 넣지 않는다. */
export const RETRY_SHARE_CARD = {
  title: "추석 보름달에 소원을 빌어보세요",
  description:
    "종이비행기를 접어 달님에게 날려 보내는 추석 이벤트. 소원 유형에 맞는 명소도 추천받아요.",
  button: "소원 빌러 가기",
} as const;

/** 당첨자 안내 (요구사항 10.5, 10.7) */
export const WINNER = {
  guideTitle: "경품 받는 방법",
  guideBody: "아래 일련번호를 복사해 네이버폼으로 제출해주세요!",
  serialLabel: "당첨 일련번호",
  copySerial: "번호 복사",
  serialCopied: "일련번호를 복사했어요",
  serialCopyFailed: "복사에 실패했어요. 번호를 직접 적어주세요.",
  /** 당첨자와 실패자 모두 같은 문구를 쓴다 (기획 결정) */
  formButton: "네이버폼으로 결과 제출하기",
} as const;

/** 개인정보 안내 (요구사항 2.6) */
export const PRIVACY = {
  linkLabel: "개인정보 수집·이용 안내",
  /** TODO: 확정 문구로 교체 */
  body:
    "이 이벤트는 카카오 계정 식별자와 닉네임만 수집합니다. 이름, 전화번호, 이메일 등은 수집하지 않습니다. 수집한 정보는 참여 횟수 확인과 당첨자 안내에만 사용하며, 이벤트 종료 후 파기합니다.",
} as const;

export const COMMON = {
  loading: "잠시만 기다려 주세요…",
  retry: "다시 시도",
  close: "닫기",
  logout: "로그아웃",
  saveFailed: "이미지를 저장하지 못했어요. 화면을 직접 캡처해 주세요.",
  storeFailed:
    "기록을 저장하지 못했어요. 결과는 그대로 확인하실 수 있어요.",
} as const;
