// ─────────────────────────────────────────────────────────────────────────────
// Grid store — background layout: style (square / horizontal lines), size (cell
// size or line spacing), plus optional custom background + gridline colors. When
// a color is null the theme default is used (so it tracks dark/light). The canvas
// engine reads this reactively; changes persist via the onChange hook.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '$config/constants';
import type { GridStyle } from '$canvas/render/grid';

let _style = $state<GridStyle>('square');
let _size = $state<number>(CONFIG.DEFAULT_GRID_SIZE);
// null → follow the current theme's tokens
let _bgColor = $state<string | null>(null);
let _lineColor = $state<string | null>(null);

let _onChange: (() => void) | null = null;
function persist() {
  _onChange?.();
}

/** A theme token value from the live document (falls back outside the browser). */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Convert a solid hex to a translucent gridline color. */
function asGridLine(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.22)`;
}

export const grid = {
  get style() {
    return _style;
  },
  get size() {
    return _size;
  },
  /** The custom background color, or null when following the theme. */
  get bgColor() {
    return _bgColor;
  },
  /** The custom gridline color, or null when following the theme. */
  get lineColor() {
    return _lineColor;
  },

  /** Resolved background color (custom or current theme's canvas bg). */
  get resolvedBg() {
    return _bgColor ?? token('--canvas-bg', '#fbf6ec');
  },
  /** Resolved gridline color (custom → translucent, or theme subtle fg). */
  get resolvedLine() {
    return _lineColor ? asGridLine(_lineColor) : asGridLine(token('--surface-fg-subtle', '#6e6962'));
  },

  setStyle(s: GridStyle) {
    _style = s;
    persist();
  },
  setSize(n: number) {
    _size = Math.max(CONFIG.MIN_GRID_SIZE, Math.min(CONFIG.MAX_GRID_SIZE, n));
    persist();
  },
  /** Set a custom background color, or null to follow the theme. */
  setBgColor(c: string | null) {
    _bgColor = c;
    persist();
  },
  /** Set a custom gridline color, or null to follow the theme. */
  setLineColor(c: string | null) {
    _lineColor = c;
    persist();
  },

  onChange(cb: () => void) {
    _onChange = cb;
  },
  snapshot() {
    return { style: _style, size: _size, bgColor: _bgColor, lineColor: _lineColor };
  },
  hydrate(s: { style?: GridStyle; size?: number; bgColor?: string | null; lineColor?: string | null }) {
    if (s.style === 'square' || s.style === 'line') _style = s.style;
    if (typeof s.size === 'number') _size = s.size;
    if (s.bgColor === null || typeof s.bgColor === 'string') _bgColor = s.bgColor;
    if (s.lineColor === null || typeof s.lineColor === 'string') _lineColor = s.lineColor;
  },
};
