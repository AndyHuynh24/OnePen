// ─────────────────────────────────────────────────────────────────────────────
// Background grid renderer — square mode (both axes) or line mode (horizontal).
// Drawn in world coords on the background canvas.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox } from '$types/geometry';

export type GridStyle = 'square' | 'line';

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  screen: BBox,
  gridSize: number,
  color: string,
  style: GridStyle = 'square',
): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.beginPath();

  // Align grid lines to integer multiples of gridSize in world space.
  const xStart = Math.floor(screen.x / gridSize) * gridSize;
  const xEnd = screen.x + screen.w;
  const yStart = Math.floor(screen.y / gridSize) * gridSize;
  const yEnd = screen.y + screen.h;

  for (let y = yStart; y <= yEnd; y += gridSize) {
    ctx.moveTo(screen.x, y);
    ctx.lineTo(xEnd, y);
  }

  if (style === 'square') {
    for (let x = xStart; x <= xEnd; x += gridSize) {
      ctx.moveTo(x, screen.y);
      ctx.lineTo(x, yEnd);
    }
  }

  ctx.stroke();
  ctx.restore();
}
