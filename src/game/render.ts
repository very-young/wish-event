/**
 * 캔버스 렌더링. (요구사항 7.1, 7.3, 14.4, 14.5)
 *
 * 이 모듈은 상태를 읽기만 하고 변경하지 않는다.
 * 시안의 드로잉을 그대로 옮기되 좌표는 가상 좌표계에서 환산한다.
 */

import { OBSTACLE } from "./config";
import { scaleBase, toPixelLength, toPixelX, toPixelY, type Vec2, type Viewport } from "./coords";
import type { Obstacle, PlaneState } from "./physics";

/** 렌더링에 필요한 한 프레임의 상태 */
export interface RenderState {
  moon: Vec2;
  moonRadius: number;
  plane: PlaneState;
  planeRadius: number;
  obstacles: readonly Obstacle[];
  /** 조준 중이면 발사대 위치와 예측 궤적 */
  aiming: {
    padPos: Vec2;
    trajectory: readonly Vec2[];
  } | null;
  /** 명중 파티클 */
  particles: readonly Particle[];
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
}

/** 캔버스 크기를 화면 배율에 맞춘다 (요구사항 14.5) */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Viewport {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

export function render(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  state: RenderState,
): void {
  ctx.clearRect(0, 0, vp.width, vp.height);

  drawMoon(ctx, vp, state.moon, state.moonRadius);

  for (const o of state.obstacles) {
    if (o.kind === "cloud") drawCloud(ctx, vp, o);
    else drawJet(ctx, vp, o);
  }

  if (state.aiming) {
    drawSlingLine(ctx, vp, state.aiming.padPos, state.plane.pos);
    drawTrajectory(ctx, vp, state.aiming.trajectory);
  }

  drawPlane(ctx, vp, state.plane, state.planeRadius);
  drawParticles(ctx, vp, state.particles);
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  pos: Vec2,
  radius: number,
): void {
  const x = toPixelX(pos.x, vp);
  const y = toPixelY(pos.y, vp);
  const r = toPixelLength(radius, vp);

  ctx.save();

  // 발광
  const glow = ctx.createRadialGradient(x, y, 4, x, y, r * 2.6);
  glow.addColorStop(0, "rgba(255,233,168,0.5)");
  glow.addColorStop(1, "rgba(255,233,168,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  // 본체
  const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 4, x, y, r);
  body.addColorStop(0, "#fff6d6");
  body.addColorStop(0.62, "#ffe9a8");
  body.addColorStop(1, "#f0d386");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // 표정. 달이 작아져도 비율이 유지되도록 r 기준으로 그린다.
  const eyeR = Math.max(1.5, r * 0.077);
  ctx.fillStyle = "#7a5a2a";
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.06, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.32, y - r * 0.06, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#7a5a2a";
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y + r * 0.18, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = "rgba(240,150,120,0.45)";
  const cheekR = Math.max(1.5, r * 0.118);
  ctx.beginPath();
  ctx.arc(x - r * 0.5, y + r * 0.15, cheekR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.5, y + r * 0.15, cheekR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlane(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  plane: PlaneState,
  radius: number,
): void {
  const x = toPixelX(plane.pos.x, vp);
  const y = toPixelY(plane.pos.y, vp);
  // 시안의 16px 기준을 반지름 비율로 환산
  const s = toPixelLength(radius, vp) / 15;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(plane.angle + Math.PI / 2);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;

  ctx.beginPath();
  ctx.moveTo(0, -16 * s);
  ctx.lineTo(12 * s, 12 * s);
  ctx.lineTo(0, 6 * s);
  ctx.lineTo(-12 * s, 12 * s);
  ctx.closePath();
  ctx.fillStyle = "#f4ecd8";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.moveTo(0, -16 * s);
  ctx.lineTo(0, 6 * s);
  ctx.lineTo(-12 * s, 12 * s);
  ctx.closePath();
  ctx.fillStyle = "#ded2b3";
  ctx.fill();

  ctx.restore();
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  o: Obstacle,
): void {
  const x = toPixelX(o.pos.x, vp);
  const y = toPixelY(o.pos.y, vp);
  const r = toPixelLength(o.radius, vp);

  ctx.save();
  ctx.fillStyle = "rgba(214,210,232,0.97)";
  const puffs: [number, number, number][] = [
    [0, 0, r * 0.6],
    [-r * 0.5, r * 0.12, r * 0.45],
    [r * 0.5, r * 0.12, r * 0.48],
    [-r * 0.15, -r * 0.28, r * 0.4],
    [r * 0.22, -r * 0.22, r * 0.42],
  ];
  for (const [dx, dy, pr] of puffs) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(245,243,252,0.9)";
  ctx.beginPath();
  ctx.arc(x - r * 0.1, y - r * 0.18, r * 0.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(150,145,180,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.34, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawJet(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  o: Obstacle,
): void {
  const x = toPixelX(o.pos.x, vp);
  const y = toPixelY(o.pos.y, vp);
  const s = toPixelLength(o.radius, vp) / 26;
  const dir = Math.sign(o.vx) || 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);

  // 비행 궤적
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3 * s;
  ctx.setLineDash([6 * s, 7 * s]);
  ctx.beginPath();
  ctx.moveTo(-16 * s, 0);
  ctx.lineTo(-90 * s, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  // 동체
  ctx.fillStyle = "#d8dced";
  ctx.beginPath();
  ctx.moveTo(24 * s, 0);
  ctx.lineTo(-8 * s, -6 * s);
  ctx.lineTo(-18 * s, -5 * s);
  ctx.lineTo(-18 * s, 5 * s);
  ctx.lineTo(-8 * s, 6 * s);
  ctx.closePath();
  ctx.fill();

  // 날개
  ctx.fillStyle = "#b9c0d8";
  ctx.beginPath();
  ctx.moveTo(2 * s, -2 * s);
  ctx.lineTo(-14 * s, -20 * s);
  ctx.lineTo(-6 * s, -2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2 * s, 2 * s);
  ctx.lineTo(-14 * s, 20 * s);
  ctx.lineTo(-6 * s, 2 * s);
  ctx.closePath();
  ctx.fill();

  // 꼬리
  ctx.beginPath();
  ctx.moveTo(-16 * s, 0);
  ctx.lineTo(-24 * s, -10 * s);
  ctx.lineTo(-18 * s, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawSlingLine(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  pad: Vec2,
  plane: Vec2,
): void {
  const px = toPixelX(pad.x, vp);
  const py = toPixelY(pad.y, vp);

  ctx.save();
  ctx.strokeStyle = "rgba(232,201,121,0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(toPixelX(plane.x, vp), toPixelY(plane.y, vp));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  points: readonly Vec2[],
): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,244,201,0.5)";
  points.forEach((p, i) => {
    // 시안처럼 한 칸 띄워 점선 느낌을 낸다
    if (i % 2 !== 0) return;
    ctx.beginPath();
    ctx.arc(toPixelX(p.x, vp), toPixelY(p.y, vp), 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  particles: readonly Particle[],
): void {
  if (particles.length === 0) return;
  ctx.save();
  ctx.fillStyle = "#fff4c9";
  for (const p of particles) {
    if (p.life <= 0) continue;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(toPixelX(p.pos.x, vp), toPixelY(p.pos.y, vp), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 명중 파티클 생성 */
export function createParticles(center: Vec2, vp: Viewport): Particle[] {
  const count = 16;
  const base = scaleBase(vp);
  const speed = 3 / base;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return {
      pos: { ...center },
      vel: {
        x: (Math.cos(a) * speed * base) / vp.width,
        y: (Math.sin(a) * speed * base) / vp.height,
      },
      life: 1,
    };
  });
}

/** 파티클을 한 스텝 진행 */
export function stepParticles(particles: readonly Particle[]): Particle[] {
  return particles
    .map((p) => ({
      pos: { x: p.pos.x + p.vel.x, y: p.pos.y + p.vel.y },
      vel: p.vel,
      life: p.life - 0.05,
    }))
    .filter((p) => p.life > 0);
}

/** 장애물 여유값을 렌더에서도 참고할 수 있게 노출 */
export const COLLISION_SLACK = OBSTACLE.collisionSlack;
