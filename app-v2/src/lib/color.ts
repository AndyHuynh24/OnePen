// ─────────────────────────────────────────────────────────────────────────────
// Color helpers — ported from app/draw.js (hexToRgb, alterRgbaBrightness).
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize any color (hex shorthand, hex, rgb/rgba) to lowercase #rrggbb so two
 *  colors can be compared for equality. Ported from normalizeColor in main.js. */
export function normalizeColor(color: string | undefined | null): string {
  if (!color) return '';
  let c = String(color).trim().toLowerCase();
  if (c.startsWith('#')) {
    if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return c;
  }
  if (c.startsWith('rgb')) {
    const m = c.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) {
      const r = parseInt(m[1], 10).toString(16).padStart(2, '0');
      const g = parseInt(m[2], 10).toString(16).padStart(2, '0');
      const b = parseInt(m[3], 10).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  return c;
}

/** Convert a hex color to a translucent rgba string for highlights. */
export function hexToRgb(hex: string, alpha = 0.15): string | null {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Brighten (or darken) an rgba/rgb color by a percentage. */
export function alterRgbaBrightness(rgba: string, percent = 7): string {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
  if (!match) return rgba;
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
  const adjust = (v: number) => Math.max(0, Math.min(255, Math.round(v + (v * percent) / 100)));
  return `rgba(${adjust(r)}, ${adjust(g)}, ${adjust(b)}, ${a})`;
}
