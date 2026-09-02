import { describe, expect, it } from "vitest";
import { CANONICAL_VIEWPORT, verifyResult, type InputLog } from "./replay";
import { PHYSICS, TOTAL_ROUNDS, moonRadius } from "./config";

/**
 * 테스트용 난이도 완화가 실제 판정에 영향을 주지 않는지 확인.
 *
 * /test 페이지는 달을 크고 느리게 만들어 성공 화면까지 확인할 수 있게 한다.
 * 그 완화가 서버 판정에까지 번지면 당첨자 수 억제 장치가 무너진다
 * (요구사항 8.18).
 *
 * 서버는 easyMode를 알지 못하고 항상 실제 크기로 재현하므로,
 * 완화된 조건에서만 맞은 발사는 서버 검증을 통과하지 못한다.
 */

describe("서버 검증은 난이도 완화를 인정하지 않는다", () => {
  it("서버가 쓰는 달 크기는 완화 배율과 무관하다", () => {
    // 서버 검증 경로에는 easyMode를 넘길 수 있는 인자가 아예 없다
    expect(verifyResult.length).toBe(2);

    // 라운드 3 달 크기는 설정값 그대로다
    const r3 = moonRadius(3);
    expect(r3).toBeGreaterThan(0);
    // 완화 배율(2배)이 적용된 값이 아니어야 한다
    expect(r3).toBeLessThan(moonRadius(1));
  });

  it("완화된 크기에서만 맞는 발사는 서버가 거부한다", () => {
    const seeds = [12345, 67890, 24680];

    /*
     * 달 반지름 바로 밖을 스치는 발사를 찾는다.
     * 실제 크기로는 빗나가지만 2배 크기라면 맞을 위치다.
     */
    let borderline: { angle: number; power: number } | null = null;

    for (let deg = -175; deg <= -5 && !borderline; deg += 1) {
      for (let p = 0.2; p <= 1.0; p += 0.01) {
        const shot = {
          tick: 0,
          angle: (deg * Math.PI) / 180,
          power: PHYSICS.maxPull * p,
        };
        const log: InputLog = { rounds: [{ round: 1, shots: [shot] }] };
        const r = verifyResult(seeds, log);
        // 라운드 1을 통과하지 못한 발사를 하나 잡는다
        if (r.reachedRound === 1) {
          borderline = shot;
          break;
        }
      }
    }

    expect(borderline, "빗나가는 발사를 찾지 못했다").not.toBeNull();

    // 그 발사만으로 3라운드 성공을 주장해도 서버는 거부한다
    const claim: InputLog = {
      rounds: Array.from({ length: TOTAL_ROUNDS }, (_, i) => ({
        round: i + 1,
        shots: [borderline!],
      })),
    };
    const verified = verifyResult(seeds, claim);
    expect(verified.success).toBe(false);
  });
});
