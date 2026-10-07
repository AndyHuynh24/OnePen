// ─────────────────────────────────────────────────────────────────────────────
// Rasterize a stroke to a square canvas for the classifier. Quadratic-Bézier
// smoothing with line_width=3 + margin, matching the training renderer.py and
// the original extractImageData(). Output feeds the TF.js image input.
// ─────────────────────────────────────────────────────────────────────────────

import type { Point } from '$types/geometry';

export function rasterizeStroke(
  inputStroke: Point[],
  imgSize = 96,
): HTMLCanvasElement | null {
  if (!inputStroke || inputStroke.length <= 0) return null;

  const lineWidth = 3; // matches config.yaml line_width=3
  const margin = lineWidth;

  const canvas = document.createElement('canvas');
  canvas.width = imgSize;
  canvas.height = imgSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, imgSize, imgSize);

  ctx.strokeStyle = 'black';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of inputStroke) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const scaleX = (imgSize - margin * 2) / (maxX - minX + 1e-5);
  const scaleY = (imgSize - margin * 2) / (maxY - minY + 1e-5);

  const pts = inputStroke.map((p) => ({
    x: (p.x - minX) * scaleX + margin,
    y: (p.y - minY) * scaleY + margin,
  }));

  ctx.beginPath();
  if (pts.length < 3) {
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  }
  ctx.stroke();

  return canvas;
}
