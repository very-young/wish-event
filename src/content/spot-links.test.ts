import { describe, expect, it } from "vitest";
import { getSpotLink, SPOT_LINK_COUNT } from "./spot-links";

/**
 * 명소 링크 연결 검증.
 *
 * 추천된 명소를 눌렀을 때 만끽지도의 올바른 장소로 가야 한다.
 * 링크가 없는 것보다 **엉뚱한 곳으로 가는 것이 더 나쁘다.**
 */

describe("명소 링크", () => {
  it("모든 명소에 링크가 있다", () => {
    // 명소 데이터가 7,082곳이므로 표도 그만큼 있어야 한다
    expect(SPOT_LINK_COUNT).toBe(7082);
  });

  it("이름이 그대로 일치하는 명소를 연결한다", () => {
    // 엑셀에 있는 이름 그대로인 경우
    const link = getSpotLink("신안 거북섬");
    expect(link).toBe("https://spot100x100.kr/map/#p=5789");
  });

  it("만끽지도 주소 형식을 지킨다", () => {
    const link = getSpotLink("신안 거북섬");
    expect(link).toMatch(/^https:\/\/spot100x100\.kr\/map\/#p=\d+$/);
  });

  it("이름 표기가 달랐던 명소도 연결된다", () => {
    /*
     * 우리 목록과 만끽지도의 이름이 달라 유사도로 맞춘 사례다.
     * 사용자가 표로 확인한 결과를 반영했다.
     */
    const cases = [
      "양양 양양시장",
      "문경새재도립공원",
      "충주 충주호",
      "이문설농탕",
      "진주성",
    ];
    for (const name of cases) {
      const link = getSpotLink(name);
      expect(link, `${name}의 링크가 없다`).not.toBeNull();
      expect(link).toMatch(/#p=\d+$/);
    }
  });

  it("표에 없는 이름은 null을 준다", () => {
    // 링크가 없으면 화면은 이름만 보여준다. 오류가 나면 안 된다.
    expect(getSpotLink("존재하지 않는 명소 이름")).toBeNull();
    expect(getSpotLink("")).toBeNull();
  });

  it("핀번호가 0 이상의 정수다", () => {
    const samples = ["신안 거북섬", "서울 양지식당", "부산 쌍둥이돼지국밥 본점"];
    for (const name of samples) {
      const link = getSpotLink(name);
      expect(link).not.toBeNull();
      const pin = Number(link!.split("#p=")[1]);
      expect(Number.isInteger(pin)).toBe(true);
      expect(pin).toBeGreaterThanOrEqual(0);
    }
  });
});
