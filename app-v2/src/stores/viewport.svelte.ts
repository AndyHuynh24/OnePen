// ─────────────────────────────────────────────────────────────────────────────
// Viewport store — scale (zoom), offset (pan), screen bbox in world coords.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox, Vec2 } from '$types/geometry';
import { CONFIG } from '$config/constants';
import { dpr } from '$canvas/transform';

// Offsets are kept on whole DEVICE pixels (offset × scale × dpr is an integer),
// so a scroll moves the canvas by an exact number of pixels and the engine can
// shift the already-rendered page instead of re-rendering it (see renderDraw).
// Sub-device-pixel precision is invisible, so nothing is lost.
function snap(v: number): number {
  const k = _scale * dpr;
  return Math.round(v * k) / k;
}

let _scale = $state<number>(CONFIG.DEFAULT_SCALE);
let _offset = $state<Vec2>({ x: 0, y: 0 });
let _screenW = $state<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
let _screenH = $state<number>(typeof window !== 'undefined' ? window.innerHeight : 768);

// Content extent. Panning is clamped so the viewport can't move more than a
// 1vw / 1vh margin past the content on ANY side — you can't scroll off into
// empty space. The canvas still grows: drawing extends the content extent,
// which extends how far you can scroll.
let _contentMin = $state<Vec2>({ x: -Infinity, y: -Infinity });
let _contentMax = $state<Vec2>({ x: Infinity, y: Infinity });

function marginX(): number {
  return (_screenW * 0.01) / _scale; // 1vw in world units
}
function marginY(): number {
  return (_screenH * 0.01) / _scale; // 1vh in world units
}
// The viewport's top-left (= offset) can travel from "1vw/1vh before the
// nearest content edge" to "1vw/1vh before the FARTHEST content edge". At the
// far end the bottommost / rightmost stroke sits near the top-left corner,
// leaving a full screen of blank canvas below / right to keep drawing on — so
// the drawing area effectively grows without bound, while you still can't fly
// off into empty space above/left of your content.
function clampX(x: number): number {
  if (_contentMin.x === -Infinity) return x; // bounds not set yet
  const min = _contentMin.x; // HARD limit: can't scroll left of the leftmost content
  const max = _contentMax.x - marginX(); // room to draw further right
  if (max <= min) return min;
  return Math.max(min, Math.min(max, x));
}
function clampY(y: number): number {
  if (_contentMin.y === -Infinity) return y;
  const min = _contentMin.y; // HARD limit: can't scroll above the topmost content
  const max = _contentMax.y - marginY(); // room to draw further down
  if (max <= min) return min;
  return Math.max(min, Math.min(max, y));
}

const _screen = $derived<BBox>({
  x: _offset.x,
  y: _offset.y,
  w: _screenW / _scale,
  h: _screenH / _scale,
});

export const viewport = {
  get scale() {
    return _scale;
  },
  get offset() {
    return _offset;
  },
  get screen() {
    return _screen;
  },
  get screenW() {
    return _screenW;
  },
  get screenH() {
    return _screenH;
  },

  setScale(next: number) {
    _scale = Math.max(CONFIG.MIN_SCALE, Math.min(CONFIG.MAX_SCALE, next));
  },

  setOffset(next: Vec2) {
    _offset = { x: snap(clampX(next.x)), y: snap(clampY(next.y)) };
  },

  pan(dx: number, dy: number) {
    _offset = { x: snap(clampX(_offset.x + dx)), y: snap(clampY(_offset.y + dy)) };
  },

  setScreenSize(w: number, h: number) {
    _screenW = w;
    _screenH = h;
  },

  /** Set the content extent (all four edges) that bounds panning. Re-clamps the
   *  current offset immediately so the view never "snaps" on the next pan. */
  setContentBounds(minX: number, minY: number, maxX: number, maxY: number) {
    _contentMin = { x: minX, y: minY };
    _contentMax = { x: maxX, y: maxY };
    const x = snap(clampX(_offset.x));
    const y = snap(clampY(_offset.y));
    // unchanged → keep the object (no reactive churn on every stroke commit)
    if (x !== _offset.x || y !== _offset.y) _offset = { x, y };
  },

  reset() {
    _scale = CONFIG.DEFAULT_SCALE;
    _offset = { x: snap(clampX(0)), y: snap(clampY(0)) };
  },
};
