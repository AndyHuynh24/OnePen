// ─────────────────────────────────────────────────────────────────────────────
// Tape (flashcard cover) renderer — a patterned, torn-edge strip drawn ON TOP of
// the content it hides. `fadeProgress` is the cover amount (1 = fully covering,
// 0 = fully revealed) and is animated by the tape store on tap.
// Ported from drawTapeGroup / generateTapePattern in app/draw.js.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { CONFIG } from '$config/constants';

const PAD = 8;
const ZIG = 8;

const patternCache = new Map<string, HTMLCanvasElement>();

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerR: number, innerR: number) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const top = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy + top);
  ctx.bezierCurveTo(cx, cy, cx - s / 2, cy, cx - s / 2, cy + top);
  ctx.bezierCurveTo(cx - s / 2, cy + (s + top) / 2, cx, cy + (s + top) * 0.7, cx, cy + s);
  ctx.bezierCurveTo(cx, cy + (s + top) * 0.7, cx + s / 2, cy + (s + top) / 2, cx + s / 2, cy + top);
  ctx.bezierCurveTo(cx + s / 2, cy, cx, cy, cx, cy + top);
  ctx.closePath();
  ctx.fill();
}

function generatePattern(presetId: string): HTMLCanvasElement {
  const size = CONFIG.TAPE.PATTERN_SIZE;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const p = cv.getContext('2d')!;
  const preset = CONFIG.TAPE.PRESETS.find((x) => x.id === presetId) ?? CONFIG.TAPE.PRESETS[0];

  p.fillStyle = preset.color1;
  p.fillRect(0, 0, size, size);
  p.fillStyle = preset.color2;
  p.strokeStyle = preset.color2;

  switch (presetId) {
    case 'stripes':
      p.lineWidth = size * 0.12;
      for (let i = -size; i < size * 2; i += size * 0.33) {
        p.beginPath();
        p.moveTo(i, 0);
        p.lineTo(i + size, size);
        p.stroke();
      }
      break;
    case 'stars':
      drawStar(p, size * 0.5, size * 0.5, 5, size * 0.3, size * 0.15);
      break;
    case 'hearts':
      drawHeart(p, size * 0.5, size * 0.35, size * 0.3);
      break;
    case 'confetti':
      (
        [
          [0.2, 0.3, '#ff6b6b'],
          [0.7, 0.2, '#4ecdc4'],
          [0.5, 0.6, '#ffe66d'],
          [0.3, 0.8, '#a8e6cf'],
          [0.8, 0.7, '#ff8b94'],
        ] as [number, number, string][]
      ).forEach(([px, py, c]) => {
        p.fillStyle = c;
        p.beginPath();
        p.arc(px * size, py * size, size * 0.06, 0, Math.PI * 2);
        p.fill();
      });
      break;
    case 'zigzag':
      p.lineWidth = size * 0.08;
      p.beginPath();
      for (let y = 0; y <= size; y += size * 0.25) {
        p.moveTo(0, y);
        p.lineTo(size * 0.5, y + size * 0.12);
        p.lineTo(size, y);
      }
      p.stroke();
      break;
    case 'polkadot':
    default: {
      const r = size * 0.12;
      (
        [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.5, 0.5],
          [0.25, 0.75],
          [0.75, 0.75],
        ] as [number, number][]
      ).forEach(([px, py]) => {
        p.beginPath();
        p.arc(px * size, py * size, r, 0, Math.PI * 2);
        p.fill();
      });
      break;
    }
  }
  return cv;
}

function getPattern(presetId: string): HTMLCanvasElement {
  let cv = patternCache.get(presetId);
  if (!cv) {
    cv = generatePattern(presetId);
    patternCache.set(presetId, cv);
  }
  return cv;
}

export function drawTapeGroup(ctx: CanvasRenderingContext2D, g: Group, scale = 1): void {
  const b = g.bbox;
  if (!b) return;
  // cover amount: 1 = fully covering, 0 = revealed
  const cover = g.fadeProgress ?? (g.revealed ? 0 : 1);

  const x = b.x - PAD;
  const y = b.y - PAD;
  const w = b.w + PAD * 2;
  const h = b.h + PAD * 2;

  // revealed (cover hidden) → leave a dashed box so you know a tape is here
  if (cover <= 0) {
    const s = 1 / scale;
    ctx.save();
    ctx.strokeStyle = '#c87090';
    ctx.lineWidth = 1.2 * s;
    ctx.setLineDash([5 * s, 3 * s]);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6 * s);
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = cover;

  // torn / zigzag outline (top edge straight, sides zigzagged)
  ctx.beginPath();
  ctx.moveTo(x + ZIG, y);
  ctx.lineTo(x + w - ZIG, y);
  let zy = y;
  let toggle = true;
  while (zy < y + h) {
    const step = Math.min(ZIG, y + h - zy);
    ctx.lineTo(toggle ? x + w - ZIG : x + w, zy + step);
    zy += step;
    toggle = !toggle;
  }
  ctx.lineTo(x + ZIG, y + h);
  zy = y + h;
  toggle = true;
  while (zy > y) {
    const step = Math.min(ZIG, zy - y);
    ctx.lineTo(toggle ? x + ZIG : x, zy - step);
    zy -= step;
    toggle = !toggle;
  }
  ctx.closePath();
  ctx.clip();

  const pattern = ctx.createPattern(getPattern(g.preset ?? 'polkadot'), 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
  }
  // soft sheen
  ctx.globalAlpha = cover * 0.15;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);

  ctx.restore();
}
