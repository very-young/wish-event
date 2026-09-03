import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEngine } from "./engine";
import { PHYSICS, PLANE, SIM_STEP } from "./config";
import { CANONICAL_VIEWPORT } from "./replay";
import type { Obstacle } from "./physics";

/**
 * 라운드 1 빗나감 안내 검증.
 *
 * 라운드 1은 무제한 재시도이므로 빗나갈 때마다 위로 문구가 나와야 한다
 * (요구사항 8.12). 문구가 안 나오면 참여자는 무엇이 잘못됐는지 모른다.
 */

function createFakeCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "createRadialGradient" || prop === "createLinearGradient") {
          return () => gradient;
        }
        return () => {};
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

function createDriver() {
  let now = 0;
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = null;
  });
  return {
    advance(steps: number) {
      for (let i = 0; i < steps; i++) {
        const cb = pending;
        if (!cb) return;
        now += SIM_STEP * 1000;
        cb(now);
      }
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("라운드 1 빗나감 안내 (요구사항 8.12)", () => {
  /**
   * 확실히 빗나가는 발사를 만든다.
   * 거의 수평으로 세게 쏘면 달에 닿지 않고 화면을 벗어난다.
   */
  function fireMiss(engine: GameEngine) {
    const base = Math.min(
      CANONICAL_VIEWPORT.width,
      CANONICAL_VIEWPORT.height,
    );
    // 당김의 반대 방향으로 날아가므로, 왼쪽으로 당기면 오른쪽으로 간다
    const power = PHYSICS.maxPull;
    const angle = -0.12; // 거의 수평
    const dx = Math.cos(angle) * power;
    const dy = Math.sin(angle) * power;
    engine.pointerDown({ x: PLANE.padX, y: PLANE.padY });
    engine.pointerMove({
      x: PLANE.padX - (dx * base) / CANONICAL_VIEWPORT.width,
      y: PLANE.padY - (dy * base) / CANONICAL_VIEWPORT.height,
    });
    engine.pointerUp();
  }

  it("빗나가면 재시도 가능 신호와 함께 알린다", () => {
    const driver = createDriver();
    const misses: { round: number; by: Obstacle["kind"] | null; canRetry: boolean }[] = [];

    const engine = new GameEngine({
      canvas: {} as HTMLCanvasElement,
      ctx: createFakeCtx(),
      roundSeeds: [12345, 67890, 24680],
      reducedMotion: true,
      events: {
        onMiss(round, by, canRetry) {
          misses.push({ round, by, canRetry });
        },
      },
    });

    engine.start(CANONICAL_VIEWPORT);
    fireMiss(engine);
    driver.advance(700);
    engine.stop();

    expect(misses.length, "빗나감이 알려지지 않았다").toBeGreaterThan(0);
    expect(misses[0].round).toBe(1);
    // 라운드 1은 무제한 재시도이므로 canRetry가 켜져 있어야 한다.
    // 이 값으로 화면이 위로 문구를 고른다.
    expect(misses[0].canRetry).toBe(true);
  });

  it("빗나감 횟수가 쌓여 문구가 순환된다", () => {
    const driver = createDriver();
    const counts: number[] = [];

    const engine = new GameEngine({
      canvas: {} as HTMLCanvasElement,
      ctx: createFakeCtx(),
      roundSeeds: [12345, 67890, 24680],
      reducedMotion: true,
      events: {
        onMiss() {
          // 화면은 이 값으로 문구를 고른다
          counts.push(engine.getMissCount());
        },
      },
    });

    engine.start(CANONICAL_VIEWPORT);

    // 세 번 빗나가게 한다
    for (let i = 0; i < 3; i++) {
      fireMiss(engine);
      driver.advance(700);
    }
    engine.stop();

    expect(counts.length).toBe(3);
    // 횟수가 1, 2, 3으로 늘어야 문구가 번갈아 나온다
    expect(counts).toEqual([1, 2, 3]);
  });

  it("빗나간 뒤 다시 조준할 수 있다", () => {
    const driver = createDriver();
    const engine = new GameEngine({
      canvas: {} as HTMLCanvasElement,
      ctx: createFakeCtx(),
      roundSeeds: [12345, 67890, 24680],
      reducedMotion: true,
    });

    engine.start(CANONICAL_VIEWPORT);
    fireMiss(engine);
    driver.advance(700);

    // 연출이 끝나면 다시 조준 대기 상태가 된다
    expect(engine.getPhase()).toBe("ready");
    expect(engine.getRound()).toBe(1);
    engine.stop();
  });
});
