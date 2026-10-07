// ─────────────────────────────────────────────────────────────────────────────
// Stroke similarity — "is this stroke a redraw of that one?"
//
// Used by the gesture-feedback rules (src/ml/rules.ts): after an undo/erase, a
// SIMILAR stroke drawn soon after is the user's second attempt, so its result
// tells us what the first stroke should have been.
//
// Two strokes are similar when they sit in about the same place (bounding-box
// IoU) AND have about the same shape (mean distance between their paths after
// resampling both to the same number of points and normalizing position and
// size). Closed shapes (box, circle) are compared at every starting point and
// in both directions, since a redraw rarely starts at the same corner.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox, Point } from '$types/geometry';

/** Tunables — expect to adjust these on real dogfooding data. */
export const SIM = {
  RESAMPLE: 32,
  MIN_IOU: 0.5,
  MAX_PATH_DIST: 0.15, // in units of the stroke's bbox diagonal
  CLOSED_GAP: 0.2, // end-to-start gap / diagonal below which a stroke is "closed"
};

export interface StrokeShape {
  bbox: BBox;
  /** SIM.RESAMPLE points, centered on the bbox and scaled by its diagonal */
  path: { x: number; y: number }[];
  closed: boolean;
}

function bboxOf(pts: Point[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Resample to `n` points evenly spaced along the path's arc length. */
export function resample(pts: Point[], n: number): { x: number; y: number }[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
  const out: { x: number; y: number }[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (j < pts.length - 1 && cum[j] < d) j++;
    const seg = cum[j] - cum[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[j - 1]) / seg));
    out.push({
      x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t,
      y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * t,
    });
  }
  return out;
}

export function shapeOf(pts: Point[]): StrokeShape {
  const bbox = bboxOf(pts);
  const diag = Math.hypot(bbox.w, bbox.h) || 1;
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const path = resample(pts, SIM.RESAMPLE).map((p) => ({ x: (p.x - cx) / diag, y: (p.y - cy) / diag }));
  const first = pts[0];
  const last = pts[pts.length - 1];
  const closed = pts.length > 2 && Math.hypot(last.x - first.x, last.y - first.y) / diag < SIM.CLOSED_GAP;
  return { bbox, path, closed };
}

/** Flat strokes (an underline is ~0px tall) would never overlap a slightly
 *  offset redraw, so each box's short side is padded to at least 15% of its long
 *  side before comparing. */
function padFlat(b: BBox): BBox {
  const min = Math.max(b.w, b.h, 1) * 0.15;
  const w = Math.max(b.w, min);
  const h = Math.max(b.h, min);
  return { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h };
}

export function bboxIoU(a0: BBox, b0: BBox): number {
  const a = padFlat(a0);
  const b = padFlat(b0);
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function meanDist(a: { x: number; y: number }[], b: { x: number; y: number }[], shift: number, rev: boolean) {
  const n = a.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let j = rev ? n - 1 - i : i;
    j = (j + shift) % n;
    sum += Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
  }
  return sum / n;
}

/** Mean point distance between two normalized paths (lower = more alike). */
export function pathDistance(a: StrokeShape, b: StrokeShape): number {
  const n = Math.min(a.path.length, b.path.length);
  if (n === 0) return Infinity;
  let best = Math.min(meanDist(a.path, b.path, 0, false), meanDist(a.path, b.path, 0, true));
  if (a.closed && b.closed) {
    for (let s = 1; s < n; s++) {
      best = Math.min(best, meanDist(a.path, b.path, s, false), meanDist(a.path, b.path, s, true));
    }
  }
  return best;
}

export function isSimilar(a: StrokeShape, b: StrokeShape): boolean {
  return bboxIoU(a.bbox, b.bbox) >= SIM.MIN_IOU && pathDistance(a, b) <= SIM.MAX_PATH_DIST;
}
