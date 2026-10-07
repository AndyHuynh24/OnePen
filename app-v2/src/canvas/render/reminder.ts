// ─────────────────────────────────────────────────────────────────────────────
// Reminder badge — a small bell disc at the top-right of a reminder group's
// union bbox. Screen-constant size (scaled by 1/scale). Red = overdue.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox } from '$types/geometry';

const OVERDUE = '#e5484d';
const UPCOMING = '#f5a623';

export function drawReminderBadge(
  ctx: CanvasRenderingContext2D,
  bbox: BBox,
  scale: number,
  overdue: boolean,
): void {
  const s = 1 / scale;
  const r = 11 * s;
  const cx = bbox.x + bbox.w + r * 0.2;
  const cy = bbox.y - r * 0.2;

  ctx.save();
  // disc
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = overdue ? OVERDUE : UPCOMING;
  ctx.fill();

  // bell glyph
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1.4 * s;
  ctx.lineJoin = 'round';
  const bw = r * 0.85;
  const bh = r * 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, cy + bh / 2 - 1 * s);
  ctx.quadraticCurveTo(cx - bw / 2, cy - bh / 2, cx, cy - bh / 2 - 1.5 * s);
  ctx.quadraticCurveTo(cx + bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2 - 1 * s);
  ctx.closePath();
  ctx.stroke();
  // clapper
  ctx.beginPath();
  ctx.arc(cx, cy + bh / 2 + 1 * s, 1.3 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
