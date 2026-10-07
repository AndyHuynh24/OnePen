// ─────────────────────────────────────────────────────────────────────────────
// Highlight renderer — translucent band with gentle sine-wave top/bottom edges.
// Ported from drawHighlight() in app/draw.js.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox } from '$types/geometry';

export function drawHighlight(ctx: CanvasRenderingContext2D, bbox: BBox, color: string): void {
  const waveAmplitude = 0.4;
  const waveFrequency = 0.06;

  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();

  const topY = bbox.y;
  const bottomY = bbox.y + bbox.h;

  ctx.moveTo(bbox.x, topY + waveAmplitude * Math.sin(bbox.x * waveFrequency));
  for (let x = bbox.x; x <= bbox.x + bbox.w; x += 2) {
    ctx.lineTo(x, topY + waveAmplitude * Math.sin(x * waveFrequency));
  }
  ctx.lineTo(bbox.x + bbox.w, bottomY);
  for (let x = bbox.x + bbox.w; x >= bbox.x; x -= 2) {
    ctx.lineTo(x, bottomY + waveAmplitude * Math.sin(x * waveFrequency + Math.PI));
  }
  ctx.lineTo(bbox.x, topY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
