// ─────────────────────────────────────────────────────────────────────────────
// Media renderer (image / PDF page) + selection border + resize handles.
// Ported from drawMediaGroup / drawMediaSelection / drawMediaHandles in draw.js.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';
import { CONFIG } from '$config/constants';

export function drawMediaGroup(
  ctx: CanvasRenderingContext2D,
  g: Group,
  img: HTMLImageElement,
): void {
  const { x, y, w, h } = g.bbox;
  ctx.save();
  ctx.globalAlpha = g.opacity ?? 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (g.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((g.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (g.crop) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    ctx.drawImage(
      img,
      g.crop.sx * iw,
      g.crop.sy * ih,
      g.crop.sw * iw,
      g.crop.sh * ih,
      x,
      y,
      w,
      h,
    );
  } else {
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
}

/** Dashed selection border (rotates with the media). */
export function drawMediaSelection(ctx: CanvasRenderingContext2D, g: Group, scale: number): void {
  const { x, y, w, h } = g.bbox;
  ctx.save();
  if (g.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((g.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = '#707888';
  ctx.lineWidth = 1.5 / scale;
  ctx.setLineDash([5 / scale, 3 / scale]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
  drawMediaHandles(ctx, g.bbox, scale);
}

/** Four square corner resize handles. */
export function drawMediaHandles(ctx: CanvasRenderingContext2D, b: BBox, scale: number): void {
  const s = CONFIG.MEDIA.HANDLE_SIZE / scale;
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x, y: b.y + b.h },
    { x: b.x + b.w, y: b.y + b.h },
  ];
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = '#d0d0d0';
  ctx.strokeStyle = '#707888';
  ctx.lineWidth = 1 / scale;
  for (const c of corners) {
    ctx.beginPath();
    ctx.rect(c.x - s / 2, c.y - s / 2, s, s);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
