// ─────────────────────────────────────────────────────────────────────────────
// Sticky-note hint — a dashed bounding box around the annotated strokes plus a
// folded-corner sticky badge. The actual note text shows in a popup on tap; the
// strokes stay visible underneath (they ARE the anchor for the note).
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { CONFIG } from '$config/constants';

export function drawStickyHint(ctx: CanvasRenderingContext2D, g: Group, scale: number): void {
  if (!g.bbox) return;
  const { x, y, w, h } = g.bbox;
  const color = g.color || CONFIG.STICKY.COLORS[0];
  const s = 1 / scale;
  const hasText = !!(g.noteStrokes && g.noteStrokes.length) || !!(g.noteText && g.noteText.trim());

  ctx.save();
  // dashed border hint (uses the sticky color)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * s;
  ctx.setLineDash([6 * s, 4 * s]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // corner sticky badge (top-right): a little folded note
  const badge = 20 * s;
  const bx = x + w - badge;
  const by = y;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(bx, by, badge, badge, 3 * s);
  ctx.fill();
  // folded corner
  const fold = badge * 0.34;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.moveTo(bx + badge - fold, by + badge);
  ctx.lineTo(bx + badge, by + badge - fold);
  ctx.lineTo(bx + badge, by + badge);
  ctx.closePath();
  ctx.fill();
  // two text lines if the note has content (else a single placeholder line)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.2 * s;
  const lx = bx + badge * 0.24;
  const rx = bx + badge * 0.66;
  ctx.beginPath();
  ctx.moveTo(lx, by + badge * 0.4);
  ctx.lineTo(rx, by + badge * 0.4);
  if (hasText) {
    ctx.moveTo(lx, by + badge * 0.62);
    ctx.lineTo(rx, by + badge * 0.62);
  }
  ctx.stroke();
  ctx.restore();
}
