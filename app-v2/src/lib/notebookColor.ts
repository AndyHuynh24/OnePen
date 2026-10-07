// ─────────────────────────────────────────────────────────────────────────────
// Deterministic notebook "spine + cover" colors. Each notebook name hashes to
// a fixed palette entry so colors stay stable across sessions.
// ─────────────────────────────────────────────────────────────────────────────

export interface NotebookColor {
  spine: string;
  cover: string;
  coverSoft: string;
  ink: string;
}

const PALETTE_LIGHT: NotebookColor[] = [
  { spine: '#b8704f', cover: '#e8c4a8', coverSoft: '#f3deca', ink: '#5c3520' }, // terracotta
  { spine: '#4a6b3f', cover: '#a8c498', coverSoft: '#d4e1c9', ink: '#243519' }, // forest
  { spine: '#4a4b8b', cover: '#9697c7', coverSoft: '#c7c8e0', ink: '#22234c' }, // indigo
  { spine: '#8b4a4a', cover: '#c89090', coverSoft: '#e1c2c2', ink: '#4a1f1f' }, // burgundy
  { spine: '#7a8b4a', cover: '#c0cf94', coverSoft: '#dee5c6', ink: '#3d4a1f' }, // sage
  { spine: '#c89a2b', cover: '#ecd187', coverSoft: '#f4e5b9', ink: '#5e4615' }, // mustard
  { spine: '#5a6b7d', cover: '#a0adba', coverSoft: '#c8cfd6', ink: '#2b343d' }, // slate
  { spine: '#9c5b8a', cover: '#cea0bf', coverSoft: '#e2c8d8', ink: '#4d2740' }, // mauve
];

const PALETTE_DARK: NotebookColor[] = [
  { spine: '#d49978', cover: '#5c3b27', coverSoft: '#3d281a', ink: '#f3deca' },
  { spine: '#9ec48f', cover: '#2f4524', coverSoft: '#1f2f17', ink: '#d4e1c9' },
  { spine: '#9697c7', cover: '#2f3060', coverSoft: '#1f2042', ink: '#c7c8e0' },
  { spine: '#d49797', cover: '#5a2828', coverSoft: '#3d1a1a', ink: '#e1c2c2' },
  { spine: '#bccc8e', cover: '#3d4a26', coverSoft: '#283018', ink: '#dee5c6' },
  { spine: '#e2c272', cover: '#5c4413', coverSoft: '#3d2d0a', ink: '#f4e5b9' },
  { spine: '#a8b5c2', cover: '#2f3a45', coverSoft: '#1c2228', ink: '#c8cfd6' },
  { spine: '#cea0bf', cover: '#4a2540', coverSoft: '#30172a', ink: '#e2c8d8' },
];

/** Number of palette entries — also the number of choices in the color picker. */
export const PALETTE_SIZE = PALETTE_LIGHT.length;

/** Hash a string to a non-negative integer (djb2-ish). */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The default palette index a notebook name hashes to (when not overridden). */
export function defaultIndexFor(name: string): number {
  return hash(name) % PALETTE_SIZE;
}

/** The color for a specific palette index in the active theme. */
export function colorAt(index: number, theme: 'light' | 'dark'): NotebookColor {
  const palette = theme === 'dark' ? PALETTE_DARK : PALETTE_LIGHT;
  return palette[((index % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE];
}

export function colorFor(name: string, theme: 'light' | 'dark'): NotebookColor {
  return colorAt(defaultIndexFor(name), theme);
}
