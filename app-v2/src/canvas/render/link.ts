// ─────────────────────────────────────────────────────────────────────────────
// Embed-link hint — a dashed bounding box around the linked strokes plus a small
// corner badge. The strokes themselves stay visible (they ARE the link); tapping
// inside the box opens the embed. Ported from drawHyperlinkGroup in app/draw.js.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';

export function drawLinkHint(
  ctx: CanvasRenderingContext2D,
  g: Group,
  scale: number,
  accent: string,
): void {
  if (!g.bbox) return;
  const { x, y, w, h } = g.bbox;
  const s = 1 / scale;

  ctx.save();
  // dashed border hint
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5 * s;
  ctx.setLineDash([6 * s, 4 * s]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // corner link badge (top-right)
  const badge = 18 * s;
  const bx = x + w - badge;
  const by = y;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(bx, by, badge, badge, 4 * s);
  ctx.fill();

  // chain-link glyph
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6 * s;
  ctx.lineCap = 'round';
  const cx = bx + badge / 2;
  const cy = by + badge / 2;
  const r = badge * 0.16;
  ctx.beginPath();
  ctx.arc(cx - r, cy - r, r, Math.PI * 0.25, Math.PI * 1.25);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + r, cy + r, r, Math.PI * 1.25, Math.PI * 2.25);
  ctx.stroke();
  ctx.restore();
}
