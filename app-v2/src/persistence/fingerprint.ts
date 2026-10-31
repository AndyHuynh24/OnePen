// ─────────────────────────────────────────────────────────────────────────────
// Group fingerprint — a cheap content hash that lets autosave find what changed
// without keeping a second copy of the note on the main thread. It allocates
// nothing per point and walks every key, so any in-place edit is seen, whichever
// tool made it. A mismatch only means a group gets re-sent, so the main thread and
// the save worker don't need to agree on anything except equal groups hashing equal.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';

const PRIME = 16777619;
const SEED = 0x811c9dc5 | 0;
/** Strings up to this long hash in full; longer ones (image data URLs) are sampled. */
const FULL_STRING = 256;

function mix(h: number, v: number): number {
  return Math.imul(h ^ v, PRIME);
}

function hashNumber(h: number, v: number): number {
  return mix(h, (v * 1024) | 0);
}

function hashString(h: number, s: string): number {
  const n = s.length;
  h = mix(h, n);
  const step = n <= FULL_STRING ? 1 : Math.floor(n / FULL_STRING);
  for (let i = 0; i < n; i += step) h = mix(h, s.charCodeAt(i));
  return h;
}

/** The hot loop: strokes are almost all of a note. Timestamps can't change. */
function hashPoints(h: number, pts: Group['stroke']): number {
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    h = mix(mix(h, (p.x * 1024) | 0), (p.y * 1024) | 0);
    if (p.p !== undefined) h = mix(h, (p.p * 1024) | 0);
  }
  return mix(h, pts.length);
}

function hashValue(h: number, v: unknown): number {
  switch (typeof v) {
    case 'number':
      return hashNumber(h, v);
    case 'string':
      return hashString(h, v);
    case 'boolean':
      return mix(h, v ? 1 : 2);
    case 'object': {
      if (v === null) return mix(h, 3);
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) h = hashValue(h, v[i]);
        return mix(h, v.length);
      }
      const o = v as Record<string, unknown>;
      let sum = 0;
      for (const k of Object.keys(o)) sum = (sum + hashValue(hashString(SEED, k), o[k])) | 0;
      return mix(h, sum);
    }
    default:
      return mix(h, 4); // undefined
  }
}

export function fingerprintGroup(g: Group): number {
  const o = g as unknown as Record<string, unknown>;
  let sum = 0;
  for (const k of Object.keys(o)) {
    const start = hashString(SEED, k);
    const v = o[k];
    sum = (sum + (k === 'stroke' && Array.isArray(v) ? hashPoints(start, g.stroke) : hashValue(start, v))) | 0;
  }
  return sum;
}
