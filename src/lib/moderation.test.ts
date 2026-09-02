import { describe, expect, it } from "vitest";
import { checkWishText } from "./moderation";

/**
 * 소원 문구 검증.
 *
 * 가장 중요한 것은 **정상 소원이 거부되지 않는 것**이다.
 * 장난 입력을 놓치는 것보다 진심 소원을 막는 것이 더 나쁘다.
 * 소원은 본인만 보므로 이상한 소원의 피해는 본인에게만 간다.
 */

describe("정상 소원은 통과한다", () => {
  const valid = [
    "올해는 아프지 않고 건강하게 지내고 싶어요",
    "원하는 회사에 취업하고 싶어요",
    "가족 모두 화목하게 지내기를",
    "시험에 합격하게 해주세요",
    "좋은 인연을 만나고 싶어요",
    "1억 모으자",
    "우리 강아지가 오래 살길",
    "엄마 아빠 건강",
    // 짧지만 뜻이 분명하다
    "합격",
    "취업",
    // 영어 소원
    "I want to be happy",
    // 숫자가 섞여도 문장이면 통과한다
    "2026년에는 꼭 내 집 마련",
    "키가 170까지 자라면 좋겠어요",
    // 감정 표현이 섞인 경우
    "ㅠㅠ 제발 합격하게 해주세요",
    "제발요ㅠㅠㅠ 붙고 싶어요",
  ];

  for (const wish of valid) {
    it(`"${wish}"`, () => {
      const r = checkWishText(wish);
      expect(
        r.ok,
        r.ok ? "" : `정상 소원이 ${(r as { reason: string }).reason}로 거부됐다`,
      ).toBe(true);
    });
  }
});

describe("소원으로 볼 수 없는 입력은 거른다", () => {
  const invalid = [
    // 숫자만
    "1234",
    "00000",
    "123456789",
    // 기호만
    "....",
    "?!?!?!",
    // 자음·모음만
    "ㅇㅇㅇ",
    "ㅋㅋㅋㅋ",
    "ㅠㅠㅠㅠ",
    "ㅎㅎㅎ",
    // 같은 글자 반복
    "아아아아아",
    "하하하하",
    "가가가가",
    // 키보드 나열
    "asdf",
    "qwerty",
    "ㅁㄴㅇㄹ",
    "zxcv",
  ];

  for (const wish of invalid) {
    it(`"${wish}"`, () => {
      const r = checkWishText(wish);
      expect(r.ok, `"${wish}"가 통과했다`).toBe(false);
      if (!r.ok) {
        // 길이 제한이 아니라 내용 문제로 걸러져야 한다
        expect(["notAWish", "tooShort"]).toContain(r.reason);
      }
    });
  }
});

describe("기존 검사는 그대로 동작한다", () => {
  it("욕설을 거른다", () => {
    const r = checkWishText("씨발 합격하게 해주세요");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bannedWord");
  });

  it("전화번호를 거른다", () => {
    const r = checkWishText("연락주세요 010-1234-5678");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("personalInfo");
  });

  it("너무 짧으면 거른다", () => {
    const r = checkWishText("가");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("tooShort");
  });

  it("80자를 넘으면 거른다", () => {
    const r = checkWishText("가".repeat(81));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("tooLong");
  });
});

describe("문장 형태는 내용을 판단하지 않는다", () => {
  /**
   * "안녕하세요 저는 바보입니다" 처럼 형태가 정상인 문장은 통과한다.
   * 내용의 진심 여부는 규칙으로 판단할 수 없고, 무리하게 막으면
   * 정상 소원이 거부된다. AI 판정이 필요한 영역이다.
   */
  it("소원과 무관해 보이는 문장도 통과한다 (의도된 동작)", () => {
    expect(checkWishText("안녕하세요 저는 바보입니다").ok).toBe(true);
  });
});
