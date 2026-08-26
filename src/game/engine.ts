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
import type { InputLog, RoundRecord, ShotRecord } from "./replay";

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
}

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

  private vp: Viewport = { width: 0, height: 0 };
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
    this.moonPath = createMoonPath(1, this.seeds[0] ?? 0);
  }

  // ---------- 수명 주기 ----------

  start(vp: Viewport): void {
    this.vp = vp;
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

  /** 화면 크기가 바뀌었을 때 (요구사항 14.4) */
  setViewport(vp: Viewport): void {
    this.vp = vp;
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
      moonRadius(this.round),
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

  /** 달의 현재 위치. 명중 후에는 멈춘 위치를 유지한다. */
  private currentMoonPos(): Vec2 {
    return this.frozenMoon ?? moonPosition(this.moonPath, this.tick);
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
    render(this.ctx, this.vp, this.buildRenderState());
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
      moonRadius: moonRadius(this.round),
      plane,
      planeRadius: PLANE.radius,
      obstacles: this.obstacles,
      aiming,
      particles: this.particles,
    };
  }
}
