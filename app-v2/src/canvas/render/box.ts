// ─────────────────────────────────────────────────────────────────────────────
// Dashed bounding box — used for move/paste previews. Drawn in world coords.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox } from '$types/geometry';

export function drawDashedBox(
  ctx: CanvasRenderingContext2D,
  bbox: BBox,
  color = 'rgba(144,144,144,0.8)',
  scale = 1,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / scale; // ~2 screen px regardless of zoom
  ctx.setLineDash([8 / scale, 5 / scale]);
  ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);
  ctx.restore();
}
