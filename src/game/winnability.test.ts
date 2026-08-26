import { describe, expect, it } from "vitest";
import { verifyResult, type InputLog, type ShotRecord } from "./replay";
import { PHYSICS, TOTAL_ROUNDS } from "./config";
import { createRng, createRoundSeeds } from "./rng";

/**
 * 당첨 가능성 검증.
 *
 * seed는 회차마다 서버가 무작위로 만든다. 어떤 seed가 나오든
 * 3라운드를 맞출 방법이 존재해야 한다. 존재하지 않는 seed가 나오면
 * 그 참여자는 아무리 잘해도 경품을 받을 수 없다.
 *
 * 라운드 3은 의도적으로 매우 어렵지만(요구사항 8.18),
 * "어렵다"와 "불가능하다"는 다르다.
 */

/** 한 라운드에서 명중하는 발사를 찾는다. 없으면 null. */
function findHit(
  seeds: readonly number[],
  cleared: readonly ShotRecord[],
  round: number,
): ShotRecord | null {
  for (let deg = -175; deg <= -5; deg += 1) {
    for (let p = 0.2; p <= 1.0; p += 0.01) {
      const candidate: ShotRecord = {
        tick: 0,
        angle: (deg * Math.PI) / 180,
        power: PHYSICS.maxPull * p,
      };
      const log: InputLog = {
        rounds: [
          ...cleared.map((s, i) => ({ round: i + 1, shots: [s] })),
          { round, shots: [candidate] },
        ],
      };
      const r = verifyResult(seeds, log);
      const passed = round >= TOTAL_ROUNDS ? r.success : r.reachedRound > round;
      if (passed) return candidate;
    }
  }
  return null;
}

/** 3라운드 전부 맞추는 발사 조합을 찾는다. 한 라운드라도 못 찾으면 null. */
function findFullClear(seeds: readonly number[]): ShotRecord[] | null {
  const shots: ShotRecord[] = [];
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const hit = findHit(seeds, shots, round);
    if (!hit) return null;
    shots.push(hit);
  }
  return shots;
}

describe("당첨 가능성 (요구사항 8.18)", () => {
  it("서버가 발급하는 무작위 seed에서도 3라운드 완주가 가능하다", () => {
    // 서버의 seed 생성 방식을 그대로 쓴다
    const rng = createRng(20260826);
    const impossible: number[][] = [];

    for (let i = 0; i < 12; i++) {
      const seeds = createRoundSeeds(() => rng.next(), TOTAL_ROUNDS);
      if (!findFullClear(seeds)) impossible.push([...seeds]);
    }

    expect(
      impossible,
      `완주 불가능한 seed 조합이 있다: ${JSON.stringify(impossible)}`,
    ).toEqual([]);
  }, 600_000);

  it("완주 로그는 서버 검증에서 당첨으로 인정된다", () => {
    const rng = createRng(777);
    const seeds = createRoundSeeds(() => rng.next(), TOTAL_ROUNDS);
    const shots = findFullClear(seeds);
    expect(shots).not.toBeNull();

    const verified = verifyResult(seeds, {
      rounds: shots!.map((s, i) => ({ round: i + 1, shots: [s] })),
    });
    expect(verified.success).toBe(true);
    expect(verified.invalidReason).toBeUndefined();
  }, 300_000);
});
