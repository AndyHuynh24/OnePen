// ─────────────────────────────────────────────────────────────────────────────
// Math solver — rasterizes the selected handwritten equation, POSTs it to the
// Flask backend (/math-server: Pix2Text OCR → LaTeX → latex2sympy2/SymPy), and
// drops a `math_result` text group to the right of the equation with the answer.
//
// The backend is NOT bundled — run it locally (math-server/server.py, port 8000)
// or point VITE_MATH_API_URL at a deployed one.
// Ported from detectAndSolveMath / createMathResultGroup in app/math.js.
// ─────────────────────────────────────────────────────────────────────────────

import { note } from '$stores/note.svelte';
import { toast } from '$stores/toast.svelte';
import { history } from '$stores/history.svelte';
import { mathVerify } from '$stores/mathVerify.svelte';
import { markDirty } from '$persistence/autosave';
import { getBoundingBox } from '$canvas/hitTest';
import { superscriptDigits } from '$lib/prettyMath';
import { CONFIG } from '$config/constants';
import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';

export interface MathResult {
  latex: string;
  result: string;
  success: boolean;
  error?: string;
}

/** Render the equation strokes onto a white canvas (each stroke separate, no
 *  connecting lines) and return it as a Blob for upload. */
function rasterizeEquation(groups: Group[]): Blob | null {
  const pts: { x: number; y: number }[] = [];
  for (const g of groups) {
    if (g.stroke) for (const p of g.stroke) pts.push(p);
  }
  if (pts.length === 0) return null;
  const { x: minX, y: minY, w, h } = getBoundingBox(pts);
  const pad = CONFIG.MATH.RASTER_PAD;
  const cw = Math.ceil(w + pad * 2);
  const ch = Math.ceil(h + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = 'black';
  ctx.lineWidth = CONFIG.MATH.RASTER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const g of groups) {
    const s = g.stroke;
    if (!s || s.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < s.length; i++) {
      const px = s[i].x - minX + pad;
      const py = s[i].y - minY + pad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // toDataURL → Blob (sync) so we don't need an async toBlob wrapper
  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

async function detectAndSolve(image: Blob): Promise<MathResult> {
  try {
    const form = new FormData();
    form.append('image', image, 'equation.png');
    const res = await fetch(CONFIG.MATH.SERVER_URL, {
      method: 'POST',
      body: form,
      mode: 'cors',
    });
    const data = await res.json();
    if (!res.ok) {
      return { latex: '', result: data.error || 'Server error', success: false, error: data.error };
    }
    return { latex: data.latex || '', result: data.result || '', success: true };
  } catch (err) {
    // network / CORS / server-down all surface here as a TypeError("Failed to fetch")
    const msg = (err as Error).message || 'unreachable';
    const friendly = /failed to fetch|networkerror/i.test(msg)
      ? "Can't reach the math server"
      : msg;
    return { latex: '', result: friendly, success: false, error: msg };
  }
}

// reuse one canvas for measuring text width
let _measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, fontSize: number, fontFamily: string): number {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
  if (!_measureCtx) return text.length * fontSize * 0.6; // fallback estimate
  _measureCtx.font = `${fontSize}px '${fontFamily}', sans-serif`;
  return _measureCtx.measureText(text).width;
}

const MATH_PAD_X = 8; // inner left+right padding inside the dashed box (must match text.ts)

/** Round a number to `places` decimals and render without trailing zeros. */
function roundStr(n: number, places: number): string {
  const m = 10 ** places;
  return String(Math.round(n * m) / m);
}

/**
 * Decimal form of a fraction/division answer, rounded to `places` decimals — or
 * null if the answer isn't a plain rational/number (e.g. symbolic like √2 or x+1)
 * or already equals its decimal (nothing to convert). Handles equation solutions
 * ("x = 1/3") and comma-separated lists ("1/3, 2/3").
 */
export function decimalForm(text: string | undefined | null, places = 4): string | null {
  if (!text) return null;
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const out: string[] = [];
  let changed = false;
  for (const part of parts) {
    const eq = part.match(/^(.*?=\s*)(.+)$/); // optional "x = " prefix
    const prefix = eq ? eq[1] : '';
    const body = (eq ? eq[2] : part).trim();

    const frac = body.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
    if (frac) {
      const den = parseFloat(frac[2]);
      if (den === 0) return null;
      out.push(prefix + roundStr(parseFloat(frac[1]) / den, places));
      changed = true;
      continue;
    }
    const num = body.match(/^-?\d+(?:\.\d+)?$/);
    if (num) {
      const r = roundStr(parseFloat(body), places);
      out.push(prefix + r);
      if (r !== body) changed = true;
      continue;
    }
    return null; // symbolic / non-numeric → no clean decimal
  }
  return changed ? out.join(', ') : null;
}

/** Re-fit a math_result's dashed box to its current `text` (after the answer or
 *  its decimal/fraction display changes). */
export function refitMathResultWidth(g: Group): void {
  const fs = g.fontSize ?? 24;
  g.bbox = {
    ...g.bbox,
    w: Math.ceil(measureText(superscriptDigits(g.text ?? ''), fs, g.fontFamily ?? 'Mali')) + MATH_PAD_X * 2,
  };
}

function makeResultGroup(sourceBBox: BBox, resultText: string, latex: string): Group {
  // the user already drew "=", so render ONLY the answer (no leading "= ")
  const text = resultText.trim();
  const h = sourceBBox.h;
  const gap = 14;
  const fontSize = Math.max(16, h * 0.7);
  const fontFamily = 'Mali';
  // width = MEASURED rendered width (with unicode superscripts) + inner padding
  const w = Math.ceil(measureText(superscriptDigits(text), fontSize, fontFamily)) + MATH_PAD_X * 2;
  const bbox: BBox = { x: sourceBBox.x + sourceBBox.w + gap, y: sourceBBox.y, w, h };
  return {
    id: note.nextId(),
    type: 'math_result',
    text,
    mathExact: text, // canonical answer (e.g. "1/3"); decimal toggle derives from this
    mathLatex: latex,
    mathSourceBBox: { ...sourceBBox },
    bbox,
    stroke: [{ x: bbox.x + w / 2, y: bbox.y + h / 2 }],
    color: '#2f9e6a',
    fontSize,
    fontFamily,
    size: 1,
    visibility: true,
  };
}

/** True if the OCR reading contains an equals sign (the trigger to solve). */
function hasEquals(latex: string): boolean {
  // pix2text may emit "=", "\\mathrm{=}", "\\eq", etc. — match a bare '='
  return /=/.test(latex);
}

/** Solve the selected equation strokes and append the result. Only solves if the
 *  user actually drew an "=" (detected in the OCR output). */
export async function solveMath(equation: Group[]): Promise<void> {
  const ink = equation.filter((g) => g.stroke && g.stroke.length >= 2);
  if (ink.length === 0) {
    toast.show('Nothing to solve', 'bx-info-circle');
    return;
  }
  const image = rasterizeEquation(ink);
  if (!image) {
    toast.show('Could not read the equation', 'bx-error');
    return;
  }

  toast.show('Solving…', 'bx-loader-alt bx-spin');
  const res = await detectAndSolve(image);
  if (!res.success) {
    toast.show(`Math solver: ${res.result}`, 'bx-error');
    return;
  }
  // gate: require a drawn "=" before producing an answer
  if (!hasEquals(res.latex)) {
    toast.show('Draw "=" after the equation to solve it', 'bx-info-circle');
    return;
  }
  if (!res.result || res.result === 'no equation' || res.result === 'No equation') {
    toast.show("Couldn't read an equation — try again", 'bx-info-circle');
    return;
  }

  const sourceBBox = getBoundingBox(ink.flatMap((g) => g.stroke ?? []));
  history.capture();
  const g = makeResultGroup(sourceBBox, res.result, res.latex);
  note.addGroup(g);
  markDirty();
  // open the verify popup (shows the OCR reading for 3s) on the fresh result
  mathVerify.open(g.id);
}

/** Re-solve a typed/edited LaTeX equation (from the math input pad) and update an
 *  existing math_result group in place. Used to correct a misread equation. */
export async function resolveMathLatex(groupId: number, latex: string): Promise<void> {
  const g = note.groups.find((x) => x.id === groupId);
  if (!g || g.type !== 'math_result') return;
  toast.show('Solving…', 'bx-loader-alt bx-spin');
  try {
    const res = await fetch(CONFIG.MATH.SOLVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors',
      body: JSON.stringify({ latex }),
    });
    const data = await res.json();
    if (!res.ok || !data.result) {
      toast.show(`Math solver: ${data.error || 'failed'}`, 'bx-error');
      return;
    }
    history.capture();
    const text = String(data.result).trim();
    g.text = text;
    g.mathLatex = latex;
    g.mathExact = text; // new canonical answer
    g.mathDecimal = false; // re-solve resets to the exact display
    refitMathResultWidth(g); // re-fit the dashed box to the new answer length
    note.commit();
    markDirty();
    toast.show('Updated', 'bx-check');
  } catch {
    toast.show("Can't reach the math server", 'bx-error');
  }
}
