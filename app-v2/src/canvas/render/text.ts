// ─────────────────────────────────────────────────────────────────────────────
// Text block renderer — multi-line text with alignment + rotation around center.
// Ported from drawTextGroup() in app/draw.js. Text renders behind strokes.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { superscriptDigits } from '$lib/prettyMath';

export function drawTextGroup(ctx: CanvasRenderingContext2D, g: Group): void {
  if (g.visibility === false || (g.type !== 'text' && g.type !== 'math_result')) return;

  // a math result: the answer text inside a dashed box marking it as solver output
  if (g.type === 'math_result') {
    const { x, y, w, h } = g.bbox;
    const color = g.color || '#2f9e6a';
    ctx.save();
    ctx.globalAlpha = g.opacity ?? 1;

    // dashed bounding box (screen-constant dash via scale would need scale; world
    // units are fine here since the box scales with content like the strokes)
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 3]);
    const r = 5;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    ctx.setLineDash([]);

    // answer text (digit powers rendered as unicode superscripts: x**3 → x³)
    ctx.font = `${g.fontSize ?? 24}px '${g.fontFamily ?? 'Mali'}', sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(superscriptDigits(g.text ?? ''), x + 8, y + h / 2);
    ctx.restore();
    return;
  }

  // a single character-stroke renders tight to its glyph cell (no block padding)
  if (g.isChar) {
    ctx.save();
    ctx.globalAlpha = g.opacity ?? 1;
    ctx.font = `${g.fontSize ?? 24}px '${g.fontFamily ?? 'Mali'}', sans-serif`;
    ctx.fillStyle = g.color || '#1a1714';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(g.text ?? '', g.bbox.x, g.bbox.y);
    ctx.restore();
    return;
  }

  const { x, y, w, h } = g.bbox;
  const fontSize = g.fontSize ?? 24;
  const fontFamily = g.fontFamily ?? 'Mali';
  const align = g.textAlign ?? 'left';
  const text = g.text ?? '';

  ctx.save();
  ctx.globalAlpha = g.opacity ?? 1;

  if (g.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((g.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.font = `${fontSize}px '${fontFamily}', sans-serif`;
  ctx.fillStyle = g.color || '#1a1714';
  ctx.textBaseline = 'top';

  let textX: number;
  if (align === 'center') {
    ctx.textAlign = 'center';
    textX = x + w / 2;
  } else if (align === 'right') {
    ctx.textAlign = 'right';
    textX = x + w - 10;
  } else {
    ctx.textAlign = 'left';
    textX = x + 10;
  }

  const lineHeight = fontSize * 1.3;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], textX, y + 5 + i * lineHeight);
  }

  ctx.restore();
}
