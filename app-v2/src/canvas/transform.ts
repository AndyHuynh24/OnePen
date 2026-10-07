// ─────────────────────────────────────────────────────────────────────────────
// Transform — screen ↔ world coordinate conversions + HiDPI canvas setup.
// World coords are stored. Screen coords are what pointer events report.
//   world.x  = screen.x / scale + offset.x
//   screen.x = (world.x - offset.x) * scale
// ─────────────────────────────────────────────────────────────────────────────

import type { Vec2 } from '$types/geometry';

export const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

/** Resize a canvas to fill `width × height` in CSS pixels, with HiDPI backing. */
export function setupHiDPICanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): void {
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
}

/**
 * Apply the world→screen transform on a 2D context. Caller should call this
 * after `clearRect`, then draw in world coordinates.
 */
export function applyViewportTransform(
  ctx: CanvasRenderingContext2D,
  scale: number,
  offset: Vec2,
): void {
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.translate(-offset.x, -offset.y);
}

/** Convert a screen-pixel position (canvas offsetX/Y) to world coords. */
export function screenToWorld(
  sx: number,
  sy: number,
  scale: number,
  offset: Vec2,
): Vec2 {
  return { x: sx / scale + offset.x, y: sy / scale + offset.y };
}

/** Convert a world position to screen pixels relative to the canvas. */
export function worldToScreen(
  wx: number,
  wy: number,
  scale: number,
  offset: Vec2,
): Vec2 {
  return { x: (wx - offset.x) * scale, y: (wy - offset.y) * scale };
}
