// ─────────────────────────────────────────────────────────────────────────────
// Draw store — transient state for the stroke currently being drawn.
// Lives separately from the persistent `note` store so we don't trigger a
// full reactivity sweep on every pointer move.
// ─────────────────────────────────────────────────────────────────────────────

import type { Point } from '$types/geometry';
import { InkSmoother } from '$canvas/render/stroke';

// Drop raw samples closer than this (screen px) to the previous one — sub-pixel
// near-duplicates carry only digitizer noise.
const MIN_SAMPLE_DIST_SQ = 0.5 * 0.5;

// Points of the in-progress stroke, ALREADY SMOOTHED (see render/stroke.ts) —
// these exact points are drawn live and become the committed stroke, so the ink
// never changes shape. Deliberately a PLAIN, non-reactive array: rendering is
// imperative, and a $state array re-proxied the whole growing stroke per sample.
let _live: Point[] = [];
let _smoother = new InkSmoother();
let _scale = 1;
let _lastRaw: Point | null = null;
// The newest RAW pen sample. The smoothed body trails the pen slightly (that's
// what smoothing is), so the wet ink draws one extra provisional point here —
// the line always reaches the pen tip with zero lag ("no friction"). At pen-up
// the final raw sample becomes the stroke's last point, so the committed stroke
// is exactly the last wet frame.
let _tip: Point | null = null;
// world-space bbox of _live (grows only) — the live layer clears just this
const _bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
let _isDrawing = false;
let _eraserPos = $state<{ x: number; y: number } | null>(null);

function grow(p: Point) {
  if (p.x < _bbox.minX) _bbox.minX = p.x;
  if (p.x > _bbox.maxX) _bbox.maxX = p.x;
  if (p.y < _bbox.minY) _bbox.minY = p.y;
  if (p.y > _bbox.maxY) _bbox.maxY = p.y;
}

function push(raw: Point) {
  _lastRaw = raw;
  const p = _smoother.push(raw);
  _live.push(p);
  grow(p);
}

/** Smoothed body + the raw tip (if the body hasn't landed on it). */
function withTip(): Point[] {
  const last = _live[_live.length - 1];
  if (!_tip || !last || (_tip.x === last.x && _tip.y === last.y)) return _live;
  return _live.concat(_tip);
}

export const draw = {
  /** The in-progress stroke as it should be drawn right now (body + pen tip). */
  get live() {
    return _isDrawing ? withTip() : _live;
  },
  /** number of frozen (smoothed) points — everything before the pen tip */
  get bodyLength() {
    return _live.length;
  },
  get bbox(): Readonly<typeof _bbox> {
    return _bbox;
  },
  get isDrawing() {
    return _isDrawing;
  },
  get eraserPos() {
    return _eraserPos;
  },

  /** Start a stroke at raw pen sample `p`. `scale` = current viewport zoom. */
  begin(p: Point, scale: number) {
    _live = [];
    _tip = null;
    _scale = scale;
    _smoother = new InkSmoother(scale);
    _bbox.minX = _bbox.maxX = p.x;
    _bbox.minY = _bbox.maxY = p.y;
    push(p);
    _isDrawing = true;
  },
  /** Add a raw pen sample (smoothed on the way in). */
  append(p: Point) {
    _tip = p;
    grow(p);
    const last = _lastRaw;
    if (last) {
      const dx = (p.x - last.x) * _scale;
      const dy = (p.y - last.y) * _scale;
      if (dx * dx + dy * dy < MIN_SAMPLE_DIST_SQ) return;
    }
    push(p);
  },
  end(): Point[] {
    const out = withTip();
    _live = [];
    _tip = null;
    _lastRaw = null;
    _isDrawing = false;
    return out;
  },
  cancel() {
    _live = [];
    _tip = null;
    _lastRaw = null;
    _isDrawing = false;
  },

  setEraserPos(x: number | null, y?: number) {
    _eraserPos = x === null ? null : { x, y: y ?? 0 };
  },
};
