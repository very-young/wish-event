/**
 * 게임 엔진. 고정 타임스텝 루프와 라운드 상태 기계.
 * (요구사항 7.9, 8.1~8.16)
 *
 * 시안은 requestAnimationFrame 프레임마다 위상을 누적해서
 * 120Hz 기기에서 달이 두 배 빨라지는 문제가 있었다.
 * 여기서는 경과 시간을 고정 스텝으로 쪼개 처리하므로
 * 기기와 무관하게 같은 tick에서 같은 상태가 된다.
 */

import {
  MAX_STEPS_PER_FRAME,
  PLANE,
  SIM_STEP,
  TOTAL_ROUNDS,
  getRoundConfig,
  moonRadius,
} from "./config";
import { distanceScaled, type Vec2, type Viewport } from "./coords";
import { createMoonPath, moonPosition, type MoonPathState } from "./moon-path";
import { initObstacles, stepObstacles } from "./obstacles";
import {
  LAUNCH_PAD,
  aimingPlanePosition,
  computeAim,
  createPlane,
  evaluateStep,
  launchPlane,
  predictTrajectory,
  shouldCancelLaunch,
  stepPlane,
  type Aim,
  type Obstacle,
  type PlaneState,
} from "./physics";
import {
  createParticles,
  render,
  stepParticles,
  type Particle,
  type RenderState,
} from "./render";
import {
  CANONICAL_VIEWPORT,
  type InputLog,
  type RoundRecord,
  type ShotRecord,
} from "./replay";

/** 라운드 진행 단계 */
export type Phase =
  | "ready" // 조준 대기
  | "aiming" // 당기는 중
  | "flying" // 비행 중
  | "hit" // 명중 연출
  | "missed" // 빗나감 연출 (라운드 1은 다시 ready로)
  | "cleared" // 최종 성공
  | "failed"; // 게임 종료

export interface EngineEvents {
  /** 라운드가 시작될 때 */
  onRoundStart?(round: number): void;
  /** 명중했을 때 */
  onHit?(round: number, isFinal: boolean): void;
  /**
   * 빗나갔을 때.
   * @param by 부딪힌 장애물 종류. null이면 화면 밖으로 나간 것
   */
  onMiss?(
    round: number,
    by: Obstacle["kind"] | null,
    canRetry: boolean,
  ): void;
  /** 게임이 끝났을 때 */
  onEnd?(success: boolean, log: InputLog): void;
  /** 상태가 바뀌어 화면 갱신이 필요할 때 */
  onPhaseChange?(phase: Phase): void;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  roundSeeds: readonly number[];
  events?: EngineEvents;
  /** 동작 축소 설정. 연출 시간을 줄인다 (요구사항 14.9) */
  reducedMotion?: boolean;
  /**
   * 달을 크고 느리게 만든다. 테스트 페이지 전용.
   *
   * ⚠️ 실제 참여 화면에서는 절대 켜지 않는다. 라운드 3 난이도는
   *    당첨자 수를 억제하는 장치다 (요구사항 8.18).
   *    이 값이 켜진 플레이는 서버 검증을 통과하지 못한다.
   */
  easyMode?: boolean;
}

/** 테스트용 완화 배율. 달을 두 배 크게, 절반 속도로 만든다. */
const EASY_MOON_SCALE = 2.0;
const EASY_SPEED_SCALE = 0.5;

/** 연출 대기 시간(스텝 단위, 60fps 기준) */
const HIT_DELAY_STEPS = 96; // 약 1.6초
const MISS_DELAY_STEPS = 78; // 약 1.3초
const FINAL_DELAY_STEPS = 84; // 약 1.4초

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly seeds: readonly number[];
  private readonly events: EngineEvents;
  private readonly reducedMotion: boolean;
  /** 테스트용 난이도 완화. 실제 참여에서는 항상 false다. */
  private readonly easyMode: boolean;

  /**
   * 시뮬레이션용 화면 크기. 항상 기준 크기로 고정한다.
   *
   * 물리 계산이 화면 크기에 영향을 받으면(중력과 속도가 축별로 정규화되므로)
   * 같은 조작이 기기마다 다른 궤적을 만든다. 그러면 서버가 재현했을 때
   * 결과가 달라져 정당한 성공이 거부된다 (설계 결정 D1).
   *
   * 가상 좌표계 덕분에 그리기만 실제 크기로 환산하면 되고,
   * 화면 크기와 무관하게 난이도가 유지된다 (요구사항 14.3).
   */
  private readonly vp: Viewport = CANONICAL_VIEWPORT;

  /** 실제 캔버스 크기. 그리기에만 사용한다. */
  private displayVp: Viewport = { width: 0, height: 0 };

  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;

  /** 현재 라운드 (1부터) */
  private round = 1;
  /** 라운드 내 tick */
  private tick = 0;
  private phase: Phase = "ready";
  private delaySteps = 0;

  private moonPath: MoonPathState;
  private obstacles: Obstacle[] = [];
  private plane: PlaneState = createPlane();
  private particles: Particle[] = [];

  /**
   * 명중 시 달이 멈춘 위치. 설정되면 이후 달은 여기 고정된다.
   * 명중 연출 중에도 달이 계속 돌아다니면 "맞았다"는 느낌이 사라진다.
   */
  private frozenMoon: Vec2 | null = null;

  /** 조준 상태 */
  private pointerPos: Vec2 | null = null;
  private currentAim: Aim | null = null;

  /** 발사 기록. 서버 검증에 제출한다. */
  private readonly log: RoundRecord[] = [];
  /** 이번 라운드의 발사 기록 */
  private currentShots: ShotRecord[] = [];
  /** 라운드 1 빗나감 횟수. 위로 문구 순환에 사용 */
  private missCount = 0;

  constructor(opts: EngineOptions) {
    this.canvas = opts.canvas;
    this.ctx = opts.ctx;
    this.seeds = opts.roundSeeds;
    this.events = opts.events ?? {};
    this.reducedMotion = opts.reducedMotion ?? false;
    this.easyMode = opts.easyMode ?? false;
    this.moonPath = createMoonPath(1, this.seeds[0] ?? 0);
  }

  // ---------- 수명 주기 ----------

  start(displayVp: Viewport): void {
    this.displayVp = displayVp;
    this.running = true;
    this.beginRound(1);
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /**
   * 화면 크기가 바뀌었을 때 (요구사항 14.4).
   *
   * ⚠️ 시뮬레이션에 쓰는 화면 크기(this.vp)는 바꾸지 않는다.
   *    물리 계산은 항상 기준 크기로 하고, 그리기만 실제 크기로 한다.
   *    그러지 않으면 서버 재현 결과와 어긋나 정당한 성공이 거부된다.
   */
  setViewport(displayVp: Viewport): void {
    this.displayVp = displayVp;
  }

  getPhase(): Phase {
    return this.phase;
  }

  getRound(): number {
    return this.round;
  }

  getMissCount(): number {
    return this.missCount;
  }

  /**
   * 판정에 쓰는 달 반지름.
   *
   * 테스트 모드에서는 크게 만들어 맞추기 쉽게 한다.
   * 서버는 실제 크기로 재현하므로, 완화된 플레이는 서버 검증을 통과하지 못한다.
   */
  private moonR(): number {
    const base = moonRadius(this.round);
    return this.easyMode ? base * EASY_MOON_SCALE : base;
  }

  // ---------- 라운드 진행 ----------

  private beginRound(round: number): void {
    this.round = round;
    this.tick = 0;
    this.moonPath = createMoonPath(round, this.seeds[round - 1] ?? 0);
    this.obstacles = initObstacles(round, this.seeds[round - 1] ?? 0);
    this.plane = createPlane();
    this.particles = [];
    this.currentShots = [];
    this.pointerPos = null;
    this.currentAim = null;
    this.frozenMoon = null;
    this.setPhase("ready");
    this.events.onRoundStart?.(round);
  }

  private setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.events.onPhaseChange?.(phase);
  }

  // ---------- 입력 ----------

  /** 포인터를 눌렀을 때. 발사대 근처여야 조준이 시작된다. */
  pointerDown(pos: Vec2): boolean {
    if (this.phase !== "ready") return false;
    if (distanceScaled(pos, LAUNCH_PAD, this.vp) > PLANE.grabRadius) {
      return false;
    }
    this.pointerPos = pos;
    this.currentAim = computeAim(LAUNCH_PAD, pos, this.vp);
    this.setPhase("aiming");
    return true;
  }

  pointerMove(pos: Vec2): void {
    if (this.phase !== "aiming") return;
    this.pointerPos = pos;
    this.currentAim = computeAim(LAUNCH_PAD, pos, this.vp);
  }

  /** 포인터를 놓았을 때 발사한다. */
  pointerUp(): void {
    if (this.phase !== "aiming" || !this.currentAim) return;
    this.fire(this.currentAim);
  }

  /** 조준을 취소하고 발사대로 되돌린다 (요구사항 7.6) */
  cancelAim(): void {
    if (this.phase !== "aiming") return;
    this.plane = createPlane();
    this.pointerPos = null;
    this.currentAim = null;
    this.setPhase("ready");
  }

  // ---------- 발사 ----------

  private fire(aim: Aim): void {
    // 비행 중이거나 판정 중에는 발사를 무시한다 (요구사항 7.9)
    if (this.phase !== "ready" && this.phase !== "aiming") return;

    if (shouldCancelLaunch(aim)) {
      this.cancelAim();
      return;
    }

    this.currentShots.push({
      tick: this.tick,
      angle: aim.angle,
      power: aim.power,
    });

    this.plane = launchPlane(aim, this.vp, LAUNCH_PAD);
    this.pointerPos = null;
    this.currentAim = null;
    this.setPhase("flying");
  }

  // ---------- 루프 ----------

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    let elapsed = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // 탭 전환 후 복귀 같은 상황에서 시간이 크게 튀는 것을 막는다
    if (elapsed > 0.25) elapsed = 0.25;
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= SIM_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.step();
      this.accumulator -= SIM_STEP;
      steps++;
    }
    // 스텝 상한을 넘으면 남은 시간을 버려 무한 루프를 막는다
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.draw();
  };

  private step(): void {
    this.tick++;
    this.obstacles = stepObstacles(this.obstacles);
    this.particles = stepParticles(this.particles);

    // 연출 대기 처리
    if (this.delaySteps > 0) {
      this.delaySteps--;
      if (this.delaySteps === 0) this.resolveDelay();
      return;
    }

    if (this.phase !== "flying") return;

    this.plane = stepPlane(this.plane, this.vp);
    const moonPos = this.currentMoonPos();
    const outcome = evaluateStep(
      this.plane,
      moonPos,
      this.moonR(),
      this.obstacles,
      this.vp,
    );

    if (outcome.type === "hit") {
      this.onHit(moonPos);
    } else if (outcome.type === "blocked") {
      this.onMiss(outcome.by);
    } else if (outcome.type === "out") {
      this.onMiss(null);
    }
  }

  /**
   * 달의 현재 위치. 명중 후에는 멈춘 위치를 유지한다.
   *
   * 테스트 모드에서는 tick을 천천히 흘려 달을 느리게 만든다.
   */
  private currentMoonPos(): Vec2 {
    if (this.frozenMoon) return this.frozenMoon;
    const t = this.easyMode
      ? Math.floor(this.tick * EASY_SPEED_SCALE)
      : this.tick;
    return moonPosition(this.moonPath, t);
  }

  private onHit(moonPos: Vec2): void {
    // 달을 명중 위치에 정지시킨다 (요구사항 8.9).
    // 이 값이 설정되면 이후 렌더·판정 모두 이 위치를 사용한다.
    this.frozenMoon = { ...moonPos };

    // 비행기를 달 위에 안착시킨다
    this.plane = {
      ...this.plane,
      pos: { ...moonPos },
      angle: -Math.PI / 2,
    };
    this.particles = createParticles(moonPos, this.vp);

    const isFinal = this.round >= TOTAL_ROUNDS;
    this.setPhase(isFinal ? "cleared" : "hit");
    this.events.onHit?.(this.round, isFinal);

    this.delaySteps = this.scaleDelay(
      isFinal ? FINAL_DELAY_STEPS : HIT_DELAY_STEPS,
    );
  }

  /** @param by 부딪힌 장애물 종류. null이면 화면 밖으로 나간 것 */
  private onMiss(by: Obstacle["kind"] | null): void {
    const cfg = getRoundConfig(this.round);
    // 라운드 1은 무제한 재시도 (요구사항 8.11)
    const canRetry = cfg.shotsAllowed === null;

    if (canRetry) this.missCount++;
    this.setPhase("missed");
    this.events.onMiss?.(this.round, by, canRetry);
    this.delaySteps = this.scaleDelay(MISS_DELAY_STEPS);
  }

  private resolveDelay(): void {
    if (this.phase === "hit") {
      this.finishRound();
      this.beginRound(this.round + 1);
      return;
    }

    if (this.phase === "cleared") {
      this.finishRound();
      this.events.onEnd?.(true, { rounds: this.log });
      return;
    }

    if (this.phase === "missed") {
      const cfg = getRoundConfig(this.round);
      if (cfg.shotsAllowed === null) {
        // 라운드 1: 다시 조준
        this.plane = createPlane();
        this.frozenMoon = null;
        this.setPhase("ready");
      } else {
        // 라운드 2·3: 게임 종료 (요구사항 8.13)
        this.finishRound();
        this.setPhase("failed");
        this.events.onEnd?.(false, { rounds: this.log });
      }
    }
  }

  private finishRound(): void {
    this.log.push({ round: this.round, shots: [...this.currentShots] });
  }

  private scaleDelay(steps: number): number {
    return this.reducedMotion ? Math.round(steps * 0.3) : steps;
  }

  // ---------- 렌더 ----------

  private draw(): void {
    // 그리기는 실제 캔버스 크기로 한다. 좌표는 가상 좌표계이므로
    // 어느 크기로 환산해도 화면 비율이 유지된다.
    render(this.ctx, this.displayVp, this.buildRenderState());
  }

  private buildRenderState(): RenderState {
    // 명중 후에는 멈춘 위치를 쓴다. 그러지 않으면 명중 연출 중에도
    // 달이 계속 돌아다녀 맞았다는 느낌이 사라진다.
    const moon = this.currentMoonPos();

    let plane = this.plane;
    let aiming: RenderState["aiming"] = null;

    if (this.phase === "aiming" && this.pointerPos && this.currentAim) {
      plane = {
        ...plane,
        pos: aimingPlanePosition(LAUNCH_PAD, this.pointerPos),
        angle: this.currentAim.angle,
      };
      aiming = {
        padPos: LAUNCH_PAD,
        trajectory: predictTrajectory(this.currentAim, this.vp, 18),
      };
    }

    return {
      moon,
      moonRadius: this.moonR(),
      plane,
      planeRadius: PLANE.radius,
      obstacles: this.obstacles,
      aiming,
      particles: this.particles,
    };
  }
}
