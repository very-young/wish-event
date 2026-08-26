import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANONICAL_VIEWPORT,
  simulate,
  verifyResult,
  type InputLog,
  type ShotRecord,
} from "./replay";
import { PHYSICS, PLANE, SIM_STEP, TOTAL_ROUNDS } from "./config";
import { GameEngine } from "./engine";
import type { Vec2, Viewport } from "./coords";

/**
 * 클라이언트와 서버의 판정 일치.
 *
 * 이 테스트가 없어서 실제 버그가 배포됐다.
 * 클라이언트는 실제 캔버스 크기(예: 420x780)로 시뮬레이션하고
 * 서버는 기준 크기(420x920)로 재현해서, 같은 조작이 다른 결과를 냈다.
 * 그 결과 정당한 3라운드 성공이 서버에서 거부돼 경품을 받지 못했다.
 *
 * ⚠️ 물리 계산 자체는 화면 비율에 영향을 받는다.
 *    중력은 화면 높이 대비 고정값이고 충돌 거리는 축별로 정규화되므로,
 *    가로세로 비율이 달라지면 궤적이 달라진다.
 *    따라서 "어떤 크기로 계산해도 같다"는 성질은 성립하지 않는다.
 *
 *    지켜야 하는 성질은 이것이다.
 *    **클라이언트도 서버와 똑같이 기준 크기로만 계산한다.**
 *    실제 캔버스 크기는 그리기에만 쓴다.
 */

// ---------- 명중 조준 탐색 ----------

const SEEDS = [12345, 67890, 24680];

/**
 * 라운드를 통과했는지 판정한다.
 *
 * 마지막 라운드를 통과하면 `reachedRound`가 더 늘지 않고 `success`가 켜진다.
 * 중간 라운드는 다음 라운드에 기록이 없어 `reachedRound`가 한 칸 오른다.
 */
function clearedRound(seeds: readonly number[], log: InputLog, round: number) {
  const r = simulate(seeds, log, CANONICAL_VIEWPORT);
  return round >= TOTAL_ROUNDS ? r.success : r.reachedRound > round;
}

/**
 * 각 라운드에서 tick 0에 명중하는 조준을 격자 탐색으로 찾는다.
 *
 * 앞 라운드를 통과한 기록을 함께 넘겨야 해당 라운드까지 진행된다.
 */
function findWinningAims(seeds: readonly number[]): ShotRecord[] {
  const found: ShotRecord[] = [];

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    let hit: ShotRecord | null = null;

    outer: for (let deg = -175; deg <= -5; deg += 1) {
      for (let p = 0.2; p <= 1.0; p += 0.01) {
        const candidate: ShotRecord = {
          tick: 0,
          angle: (deg * Math.PI) / 180,
          power: PHYSICS.maxPull * p,
        };
        const probe: InputLog = {
          rounds: [
            ...found.map((shot, i) => ({ round: i + 1, shots: [shot] })),
            { round, shots: [candidate] },
          ],
        };
        if (clearedRound(seeds, probe, round)) {
          hit = candidate;
          break outer;
        }
      }
    }

    if (!hit) throw new Error(`라운드 ${round}을 맞추는 조준을 찾지 못했다`);
    found.push(hit);
  }

  return found;
}

describe("성공 로그가 서버 검증을 통과하는지", () => {
  /**
   * 정당한 성공이 거부되면 참여자는 경품을 받지 못한다.
   * 실제로 이 문제가 발생했으므로 회귀 방지용으로 남긴다.
   */
  it("3라운드를 모두 맞춘 로그는 성공으로 판정된다", () => {
    const aims = findWinningAims(SEEDS);
    const log: InputLog = {
      rounds: aims.map((shot, i) => ({ round: i + 1, shots: [shot] })),
    };

    const verified = verifyResult(SEEDS, log);
    expect(verified.invalidReason).toBeUndefined();
    expect(verified.reachedRound).toBe(TOTAL_ROUNDS);
    expect(verified.success).toBe(true);
  });

  it("라운드 2·3 발사 횟수 제한은 그대로 지켜진다", () => {
    const aims = findWinningAims(SEEDS);

    // 라운드 2에 두 발을 기록하면 허용치 초과로 거부돼야 한다
    const log: InputLog = {
      rounds: [
        { round: 1, shots: [aims[0]] },
        { round: 2, shots: [aims[1], { ...aims[1], tick: 30 }] },
      ],
    };
    const verified = verifyResult(SEEDS, log);
    expect(verified.success).toBe(false);
    expect(verified.invalidReason).toContain("발사 횟수");
  });
});

// ---------- 엔진 하네스 ----------

/** 렌더링 호출을 모두 무시하는 캔버스 컨텍스트. */
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

/**
 * 원하는 조준값이 나오는 포인터 위치를 역산한다.
 *
 * `computeAim`이 당김 벡터를 기준 길이로 정규화하는 계산을 거꾸로 푼다.
 * 엔진이 기준 크기로 계산하므로 여기서도 기준 크기를 쓴다.
 */
function pointerPosFor(aim: ShotRecord, vp: Viewport): Vec2 {
  const base = Math.min(vp.width, vp.height);
  const dx = Math.cos(aim.angle) * aim.power;
  const dy = Math.sin(aim.angle) * aim.power;
  return {
    x: PLANE.padX - (dx * base) / vp.width,
    y: PLANE.padY - (dy * base) / vp.height,
  };
}

/** 고정 클럭과 rAF 스텁으로 엔진 루프를 직접 돌린다. */
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
    /** 시뮬레이션 스텝 n개만큼 시간을 진행시킨다. */
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

/**
 * 주어진 조준을 순서대로 발사한다.
 *
 * @param displayVp 캔버스 크기. 판정에 영향을 주면 안 된다.
 * @param onSetup 발사 전에 화면 크기를 바꾸는 등의 조작
 */
function playThrough(
  seeds: readonly number[],
  aims: readonly ShotRecord[],
  displayVp: Viewport,
  onSetup?: (engine: GameEngine, index: number) => void,
): { success: boolean; log: InputLog } {
  const driver = createDriver();
  let ended: { success: boolean; log: InputLog } | null = null;

  const engine = new GameEngine({
    canvas: {} as HTMLCanvasElement,
    ctx: createFakeCtx(),
    roundSeeds: seeds,
    // 연출 대기를 줄여 진행을 빠르게 한다
    reducedMotion: true,
    events: {
      onEnd(success, log) {
        ended = { success, log };
      },
    },
  });

  engine.start(displayVp);

  for (let i = 0; i < aims.length && !ended; i++) {
    onSetup?.(engine, i);
    // 포인터 좌표는 정규화된 값이다. GameCanvas도 같은 형태로 넘긴다.
    engine.pointerDown({ x: PLANE.padX, y: PLANE.padY });
    engine.pointerMove(pointerPosFor(aims[i], CANONICAL_VIEWPORT));
    engine.pointerUp();
    // 비행과 연출이 끝나 다음 라운드가 준비될 때까지 진행
    driver.advance(700);
  }

  engine.stop();
  if (!ended) throw new Error("게임이 끝나지 않았다");
  return ended;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Property 17: 판정은 표시 화면 크기와 무관하다", () => {
  const displaySizes: Viewport[] = [
    { width: 420, height: 920 }, // 기준
    { width: 420, height: 780 }, // 실제 버그를 일으킨 크기
    { width: 390, height: 844 }, // iPhone
    { width: 360, height: 640 }, // 구형 안드로이드
    { width: 500, height: 900 }, // 데스크톱 무대
  ];

  /**
   * 라운드 1은 tick 0에 발사하므로 조준을 미리 찾아둘 수 있다.
   * 라운드 2는 빗나가게 두어 게임이 끝나게 한다.
   * (라운드 2 이후의 발사 tick은 연출 시간에 따라 달라져 미리 알 수 없다)
   */
  function aimsForEngine(): ShotRecord[] {
    const first = findWinningAims(SEEDS)[0];
    // 라운드 2에서 확실히 빗나가는 조준 (거의 수평으로 약하게)
    const miss: ShotRecord = {
      tick: 0,
      angle: -0.15,
      power: PHYSICS.maxPull,
    };
    return [first, miss];
  }

  it("어떤 캔버스 크기에서도 같은 조작이 같은 로그를 만든다", () => {
    const aims = aimsForEngine();
    const base = playThrough(SEEDS, aims, displaySizes[0]);

    // 라운드 1은 통과하고 라운드 2에서 끝나야 비교가 의미 있다
    expect(base.log.rounds.length).toBe(2);
    expect(base.success).toBe(false);

    for (const vp of displaySizes.slice(1)) {
      const other = playThrough(SEEDS, aims, vp);
      expect(
        other.log,
        `${vp.width}x${vp.height}에서 입력 로그가 달라졌다`,
      ).toEqual(base.log);
      expect(
        other.success,
        `${vp.width}x${vp.height}에서 판정이 달라졌다`,
      ).toBe(base.success);
    }
  });

  it("플레이 중 화면 크기가 바뀌어도 판정이 흔들리지 않는다", () => {
    const aims = aimsForEngine();
    const base = playThrough(SEEDS, aims, CANONICAL_VIEWPORT);

    // 회전이나 창 크기 조절로 발사마다 캔버스 크기가 바뀌는 상황
    const changing = [
      { width: 360, height: 640 },
      { width: 500, height: 900 },
    ];
    const resized = playThrough(
      SEEDS,
      aims,
      CANONICAL_VIEWPORT,
      (engine, i) => engine.setViewport(changing[i]),
    );

    expect(resized.log).toEqual(base.log);
    expect(resized.success).toBe(base.success);
  });

  it("클라이언트가 만든 로그를 서버가 재현하면 같은 결과가 나온다", () => {
    const aims = aimsForEngine();

    for (const vp of displaySizes) {
      const played = playThrough(SEEDS, aims, vp);
      const verified = verifyResult(SEEDS, played.log);

      // 조작이 부정하지 않으므로 검증 거부 사유가 없어야 한다
      expect(
        verified.invalidReason,
        `${vp.width}x${vp.height}의 정당한 플레이가 부정으로 판정됐다`,
      ).toBeUndefined();
      expect(
        verified.success,
        `${vp.width}x${vp.height}에서 클라이언트와 서버 판정이 갈렸다`,
      ).toBe(played.success);
      expect(verified.reachedRound).toBe(played.log.rounds.length);
    }
  });
});
