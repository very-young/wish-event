/**
 * 소원 문구 검증. (요구사항 4.3~4.5, 5.1~5.3)
 *
 * 클라이언트와 서버가 같은 모듈을 사용한다.
 * 클라이언트 검사는 즉각 피드백용이고, 저장 여부는 서버 판정만 신뢰한다.
 */

import { WISH_TEXT_LIMIT } from "@/content/settings";

export type RejectReason =
  | "blank"
  | "tooShort"
  | "tooLong"
  | "bannedWord"
  | "personalInfo"
  /** 소원으로 볼 수 없는 입력 (숫자만, 같은 글자 반복 등) */
  | "notAWish";

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: RejectReason };

/**
 * 기본 금지어 목록.
 * TODO: 실제 운영 목록으로 교체. 최종적으로는 DB에서 로드해
 *       코드 배포 없이 갱신할 수 있게 한다 (작업 8.3).
 */
const BANNED_WORDS: readonly string[] = [
  // 자리표시자. 실제 목록은 운영 단계에서 채운다.
  "씨발",
  "개새끼",
  "병신",
  "지랄",
  "좆",
  "섹스",
  "도박",
  "카지노",
];

/** 개인정보·광고성 패턴 (요구사항 5.3) */
const PERSONAL_INFO_PATTERNS: readonly RegExp[] = [
  // 전화번호: 010-1234-5678, 01012345678, 010 1234 5678
  /0\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{4}/,
  // 이메일
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  // URL
  /(https?:\/\/|www\.)\S+/i,
  // 도메인 형태
  /\b[\w-]+\.(com|net|co\.kr|kr|io|me|shop|store)\b/i,
  // 카카오톡 아이디 유도
  /(카톡|카카오톡|오픈채팅|오픈톡)\s*(아이디|id|:|＠|@)/i,
];

/**
 * 우회 탐지를 위한 정규화.
 *
 * 자모 사이에 특수문자나 공백을 끼워 넣는 우회를 막기 위해
 * 공백·특수문자를 제거한 문자열로도 함께 검사한다.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * 소원으로 볼 수 없는 입력인지 판정한다.
 *
 * 목적은 "1234", "ㅋㅋㅋㅋ" 처럼 명백히 내용이 없는 입력을 되돌리는 것이다.
 * 문장 형태를 갖춘 입력은 통과시킨다 — 내용의 진심 여부는 규칙으로
 * 판단할 수 없고, 무리하게 막으면 정상 소원이 거부된다.
 *
 * 소원은 본인만 보므로 과하게 막는 쪽이 더 손해다.
 */
function looksNotLikeWish(text: string): boolean {
  const t = text.trim();

  // 글자(한글·영문)를 뺀 나머지
  const letters = t.replace(/[^\p{L}]/gu, "");

  // 1) 글자가 하나도 없다: "1234", "....", "?!?!"
  if (letters.length === 0) return true;

  /*
   * 2) 완성되지 않은 한글만 있다: "ㅇㅇㅇ", "ㅠㅠㅠ", "ㅎㅎ"
   *    자음·모음 낱자만으로는 뜻을 전할 수 없다.
   */
  const hasCompleteHangul = /[가-힣]/.test(t);
  const hasLatinWord = /[a-z]{2,}/i.test(t);
  const onlyJamo = /^[\u3131-\u318E\s\p{P}\p{S}\d]+$/u.test(t);
  if (onlyJamo && !hasCompleteHangul) return true;

  /*
   * 3) 같은 글자만 반복한다: "아아아아", "ㅋㅋㅋㅋ", "하하하하"
   *    서로 다른 글자가 2종류 이하면 뜻을 이루기 어렵다.
   */
  const uniqueLetters = new Set(letters).size;
  if (letters.length >= 4 && uniqueLetters <= 2) return true;

  /*
   * 4) 뜻을 이룰 글자가 너무 적다.
   *    완성된 한글도, 두 글자 이상 영단어도 없는 경우다.
   */
  if (!hasCompleteHangul && !hasLatinWord) return true;

  // 5) 키보드를 훑어 적은 경우
  const compact = normalize(t);
  const KEYBOARD_RUNS = [
    "qwerty",
    "asdf",
    "zxcv",
    "1234",
    "ㅁㄴㅇㄹ",
    "ㅂㅈㄷㄱ",
    "ㅋㅌㅊㅍ",
  ];
  for (const run of KEYBOARD_RUNS) {
    if (compact.includes(run)) return true;
  }

  return false;
}

export function checkWishText(raw: string): CheckResult {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "blank" };
  }
  if (trimmed.length < WISH_TEXT_LIMIT.min) {
    return { ok: false, reason: "tooShort" };
  }
  if (raw.length > WISH_TEXT_LIMIT.max) {
    return { ok: false, reason: "tooLong" };
  }

  // 개인정보 패턴은 원문에서 검사한다 (구분자가 의미를 가지므로)
  for (const pattern of PERSONAL_INFO_PATTERNS) {
    if (pattern.test(raw)) {
      return { ok: false, reason: "personalInfo" };
    }
  }

  // 금지어는 원문과 정규화 문자열 양쪽에서 검사한다
  const lowered = raw.toLowerCase();
  const normalized = normalize(raw);
  for (const word of BANNED_WORDS) {
    const nw = normalize(word);
    if (lowered.includes(word) || (nw.length > 0 && normalized.includes(nw))) {
      return { ok: false, reason: "bannedWord" };
    }
  }

  // 소원으로 볼 수 없는 입력을 되돌린다
  if (looksNotLikeWish(trimmed)) {
    return { ok: false, reason: "notAWish" };
  }

  return { ok: true };
}

/** 금지어 목록을 노출해 테스트와 운영 도구가 참조할 수 있게 한다. */
export const BANNED_WORD_LIST = BANNED_WORDS;
