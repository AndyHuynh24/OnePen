// ─────────────────────────────────────────────────────────────────────────────
// Table of contents — groups the current note's title strokes (titleStatus) by
// their titleGroupId into heading anchors, sorted top-to-bottom. Ported from
// regroupTitles / populateTocList in app/main.js.
// ─────────────────────────────────────────────────────────────────────────────

import { note } from '$stores/note.svelte';
import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';

export interface TocStroke {
  points: { x: number; y: number }[];
  color: string;
  size: number;
}

export interface TocAnchor {
  id: string;
  level: 1 | 2 | 3;
  bbox: BBox;
  strokes: TocStroke[];
}

interface Acc {
  level: 1 | 2 | 3;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  strokes: TocStroke[];
}

/** Build the heading anchors for the current note (sorted by vertical position). */
export function buildToc(): TocAnchor[] {
  const groups = note.groups;
  const byGroup = new Map<string, Acc>();

  for (const g of groups) {
    if (!g.titleStatus || g.visibility === false || !g.bbox) continue;
    const level = (g.titleLevel ?? 1) as 1 | 2 | 3;
    const key = g.titleGroupId || `solo_${g.id}`;
    const b = g.bbox;
    const stroke: TocStroke | null =
      g.stroke && g.stroke.length > 0
        ? { points: g.stroke.map((p) => ({ x: p.x, y: p.y })), color: g.color || '#888', size: g.size || 2 }
        : null;

    let acc = byGroup.get(key);
    if (!acc) {
      acc = { level, minX: b.x, maxX: b.x + b.w, minY: b.y, maxY: b.y + b.h, strokes: [] };
      byGroup.set(key, acc);
    } else {
      acc.minX = Math.min(acc.minX, b.x);
      acc.maxX = Math.max(acc.maxX, b.x + b.w);
      acc.minY = Math.min(acc.minY, b.y);
      acc.maxY = Math.max(acc.maxY, b.y + b.h);
    }
    if (stroke) acc.strokes.push(stroke);
  }

  const anchors: TocAnchor[] = [];
  for (const [id, a] of byGroup) {
    anchors.push({
      id,
      level: a.level,
      bbox: { x: a.minX, y: a.minY, w: a.maxX - a.minX, h: a.maxY - a.minY },
      strokes: a.strokes,
    });
  }
  anchors.sort((p, q) => p.bbox.y - q.bbox.y);
  return anchors;
}

/** Total heading count (for the TOC button indicator). */
export function tocCount(_groups: Group[]): number {
  const ids = new Set<string>();
  for (const g of _groups) {
    if (g.titleStatus && g.visibility !== false && g.bbox) ids.add(g.titleGroupId || `solo_${g.id}`);
  }
  return ids.size;
}
