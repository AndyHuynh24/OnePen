// ─────────────────────────────────────────────────────────────────────────────
// Stroke ink — smoothed ONCE at input, drawn the same way forever after.
//
//   pen sample ─▶ InkSmoother.push() ─▶ frozen point ─▶ drawStroke()
//
// 1. Smoothing happens as each sample ARRIVES (draw store → InkSmoother), and the
//    smoothed point is what gets stored in the stroke. A point is never touched
//    again, so ink already on screen can't move or "re-smooth" — not while
//    writing, not at pen-up, not on reload.
//    The filter is a 1€ filter (Casiez et al., CHI 2012) — the same family the
//    big note apps use: slow pen → low cutoff → hand/digitizer tremor is damped;
//    fast pen → cutoff opens → quick strokes keep their shape with no lag. It's
//    time-based (sample timestamps), so it behaves the same at 60/120/240Hz, and
//    speed is measured in SCREEN px so it feels the same at every zoom.
//
// 2. drawStroke() does NOT smooth — it just traces the stored points with
//    midpoint quadratic curves (each sample is the control point, the curve runs
//    through the midpoints between samples). That curve is append-only: adding a
//    sample only replaces the final half-segment "tail" line with a curve that
//    leaves along the same tangent, so the live ink grows forward without the
//    shape behind it changing. The live wet ink and the committed layer call
//    this same function on the same points → identical pixels at pen-up.
// ─────────────────────────────────────────────────────────────────────────────

import type { Point } from '$types/geometry';

export interface StrokeStyle {
  color: string;
  size: number;
  /** widthFactor multiplier (1 = the tool size) */
  widthFactor?: number;
  dash?: boolean;
}

// 1€ parameters (units: SCREEN px, seconds). Simulated on handwriting-sized
// curves at 60/120/240Hz with ±0.5px digitizer noise: removes ~15–60% of the
// wobble (most at slow speeds, where it's visible) while the line stays within
// ~0.2px of the true path shape and the tip within ~1px of the pen.
const MIN_CUTOFF_HZ = 3; // cutoff at rest — lower = smoother slow writing, more lag
const BETA = 0.2; // how fast the cutoff opens with speed — higher = more faithful
const D_CUTOFF_HZ = 5; // smoothing of the speed estimate itself
const DEFAULT_DT = 1 / 120; // samples without timestamps

function alphaFor(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

/** Incremental (causal) ink filter. push() each raw sample once, in order; the
 *  returned point is final. The first sample passes through exactly. */
export class InkSmoother {
  private x = 0;
  private y = 0;
  private t: number | undefined;
  private speed = -1; // filtered speed, screen px / s (-1 = not yet measured)
  private started = false;

  /** `scale` = viewport zoom (screen px per world px) while this stroke is drawn. */
  constructor(private readonly scale = 1) {}

  push(p: Point): Point {
    if (!this.started) {
      this.started = true;
      this.x = p.x;
      this.y = p.y;
      this.t = p.t;
      return { ...p };
    }
    let dt = this.t != null && p.t != null ? (p.t - this.t) / 1000 : DEFAULT_DT;
    if (!(dt > 0.001)) dt = 0.001; // coalesced samples can share a timestamp
    if (dt > 0.05) dt = 0.05; // a pause shouldn't read as "very slow"
    this.t = p.t;
    const raw = (Math.hypot(p.x - this.x, p.y - this.y) * this.scale) / dt;
    // seed with the first measured speed so a fast stroke isn't over-smoothed
    // while the estimate warms up
    this.speed = this.speed < 0 ? raw : this.speed + alphaFor(D_CUTOFF_HZ, dt) * (raw - this.speed);
    const a = alphaFor(MIN_CUTOFF_HZ + BETA * this.speed, dt);
    this.x += a * (p.x - this.x);
    this.y += a * (p.y - this.y);
    return { ...p, x: this.x, y: this.y };
  }
}

/** Run a whole raw stroke through the filter (same result as pushing live). */
export function smoothInk(pts: Point[], scale = 1): Point[] {
  const s = new InkSmoother(scale);
  return pts.map((p) => s.push(p));
}

/** Render a stroke (live wet ink and committed ink use this same function). */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  style: StrokeStyle,
): void {
  const n = pts?.length ?? 0;
  if (n === 0) return;

  const width = style.size * (style.widthFactor ?? 1);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.color;
  ctx.lineWidth = width;
  if (style.dash) ctx.setLineDash([6, 4]);

  ctx.beginPath();
  if (n === 1) {
    // single point — a dot, so a tap still leaves a mark
    ctx.fillStyle = style.color;
    ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.lineTo(pts[n - 1].x, pts[n - 1].y); // tail to the latest point
  ctx.stroke();
  ctx.restore();
}

/** Repaint only the part of a stroke inside `box` (world coords; the caller has
 *  cleared + clipped to it). Draws just the curve pieces whose control hull
 *  touches the box, so the wet ink costs the same per pen sample whether the
 *  stroke is 10 or 10 000 points long. Same pieces as drawStroke() — with round
 *  caps/joins, separate pieces cover exactly the same pixels as one path. */
export function drawStrokeRegion(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  style: StrokeStyle,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  const n = pts.length;
  if (n < 3) {
    drawStroke(ctx, pts, style);
    return;
  }
  const width = style.size * (style.widthFactor ?? 1);
  const r = width / 2;
  const x0 = box.minX - r;
  const y0 = box.minY - r;
  const x1 = box.maxX + r;
  const y1 = box.maxY + r;
  const hit = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    Math.max(ax, bx, cx) >= x0 &&
    Math.min(ax, bx, cx) <= x1 &&
    Math.max(ay, by, cy) >= y0 &&
    Math.min(ay, by, cy) <= y1;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let sx = pts[0].x;
  let sy = pts[0].y;
  let open = false; // is the current subpath continuous up to (sx, sy)?
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const ex = (p.x + q.x) / 2;
    const ey = (p.y + q.y) / 2;
    if (hit(sx, sy, p.x, p.y, ex, ey)) {
      if (!open) ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(p.x, p.y, ex, ey);
      open = true;
    } else {
      open = false;
    }
    sx = ex;
    sy = ey;
  }
  const last = pts[n - 1];
  if (hit(sx, sy, last.x, last.y, last.x, last.y)) {
    if (!open) ctx.moveTo(sx, sy);
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
  ctx.restore();
}
