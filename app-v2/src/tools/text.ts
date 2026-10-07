// ─────────────────────────────────────────────────────────────────────────────
// Text blocks — create / measure / edit. Ported from handleTextInsert,
// recalculateTextBbox, updateTextStrokes in app/main.js.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { BBox, Stroke } from '$types/geometry';
import { note } from '$stores/note.svelte';
import { viewport } from '$stores/viewport.svelte';
import { history } from '$stores/history.svelte';
import { editor } from '$stores/editor.svelte';
import { moveMode } from '$stores/move.svelte';
import { markDirty } from '$persistence/autosave';

export const TEXT_FONTS = ['Mali', 'Arial', 'Georgia', 'Courier New'] as const;

// shared offscreen context just for text measurement
let _measureCtx: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) {
    const c = document.createElement('canvas');
    _measureCtx = c.getContext('2d')!;
  }
  return _measureCtx;
}

function canvasInk(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--canvas-ink').trim();
  return v || '#1a1714';
}

/** 4 bbox-corner points so the text block has a valid stroke for hit/bbox. */
function cornerStroke(b: BBox): Stroke {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

/** 3 fake edge strokes (top/right/bottom) so modifiers can wrap the text. */
function fakeStrokes(b: BBox): Stroke[] {
  return [
    [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }],
    [{ x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }],
    [{ x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }],
  ];
}

/** Resize the text block's bbox to fit its content (keeps x,y). */
export function recalcTextBbox(g: Group): void {
  const ctx = measureCtx();
  const fontSize = g.fontSize ?? 24;
  ctx.font = `${fontSize}px '${g.fontFamily ?? 'Mali'}', sans-serif`;
  const lines = (g.text ?? '').split('\n');
  let maxW = 0;
  for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln || ' ').width);
  const lineHeight = fontSize * 1.3;
  g.bbox.w = Math.max(maxW + 20, 50); // 10px l/r padding
  g.bbox.h = Math.max(lines.length * lineHeight + 10, 30); // 5px t/b padding
  g.stroke = cornerStroke(g.bbox);
  g.fakeStrokes = fakeStrokes(g.bbox);
}

/** Create a new text block centered in the viewport and open the editor. */
export function createTextAtCenter(): void {
  const cx = viewport.offset.x + viewport.screenW / (2 * viewport.scale);
  const cy = viewport.offset.y + viewport.screenH / (2 * viewport.scale);
  const g: Group = {
    id: note.nextId(),
    type: 'text',
    text: '',
    fontFamily: 'Mali',
    fontSize: 24,
    color: canvasInk(),
    textAlign: 'left',
    rotation: 0,
    opacity: 1,
    visibility: true,
    zIndex: 0,
    bbox: { x: cx - 50, y: cy - 15, w: 100, h: 30 },
    stroke: [],
    size: 1,
  };
  recalcTextBbox(g);
  // re-center now that we know the size
  g.bbox.x = cx - g.bbox.w / 2;
  g.bbox.y = cy - g.bbox.h / 2;
  recalcTextBbox(g);

  history.capture();
  note.addGroup(g);
  markDirty();
  editor.open(g.id);
}

/** Break an editable text block into one lightweight group per character so
 *  each glyph behaves like a stroke (enclosable, colorable, deletable, movable).
 *  Uses bbox-corner proxies — no rasterization — so it's cheap. */
export function decomposeText(g: Group): Group[] {
  const ctx = measureCtx();
  const fontSize = g.fontSize ?? 24;
  const fontFamily = g.fontFamily ?? 'Mali';
  ctx.font = `${fontSize}px '${fontFamily}', sans-serif`;
  const lineHeight = fontSize * 1.3;
  const lines = (g.text ?? '').split('\n');
  const out: Group[] = [];
  const startX = g.bbox.x + 10; // match the editor block's left padding
  const startY = g.bbox.y + 5;
  const textGroupId = `tg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  for (let li = 0; li < lines.length; li++) {
    let x = startX;
    const y = startY + li * lineHeight;
    for (const ch of lines[li]) {
      const w = ctx.measureText(ch).width;
      if (ch.trim() !== '') {
        const bbox: BBox = { x, y, w: Math.max(w, 2), h: fontSize };
        out.push({
          id: note.nextId(),
          type: 'text',
          isChar: true,
          textGroupId,
          text: ch,
          fontFamily,
          fontSize,
          color: g.color,
          textAlign: 'left',
          rotation: 0,
          opacity: g.opacity ?? 1,
          visibility: true,
          zIndex: 0,
          bbox,
          stroke: cornerStroke(bbox),
          size: 1,
        });
      }
      x += w;
    }
  }
  return out;
}

/** Finalize an editing text block: decompose into character-strokes and drop
 *  into a paste-style placement box so the user can position it. */
export function finalizeText(g: Group): void {
  const chars = decomposeText(g);
  // replace the editable block with the character-strokes
  note.setGroups([...note.groups.filter((x) => x.id !== g.id), ...chars]);
  markDirty();
  editor.close();
  if (chars.length > 0) {
    moveMode.begin(chars, true); // placing = true → drag + tap-outside-to-place
  } else {
    history.dropLast(); // nothing typed → discard the creation snapshot
  }
}

/** Cancel an editing text block (Escape / empty): remove it + drop the snapshot. */
export function cancelText(g: Group): void {
  note.removeGroup(g.id);
  history.dropLast();
  markDirty();
  editor.close();
}
