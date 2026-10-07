// ─────────────────────────────────────────────────────────────────────────────
// Media image cache — keeps decoded <img> elements keyed by group id so the
// render loop doesn't re-decode every frame. Cleared on note switch.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';

const cache = new Map<number, HTMLImageElement>();

/** Get a loaded image for a media group, kicking off a load if needed. */
export function getMediaImage(group: Group, onLoad: () => void): HTMLImageElement | null {
  const existing = cache.get(group.id);
  if (existing) return existing.complete ? existing : null;
  if (!group.dataUrl) return null;
  const img = new Image();
  img.onload = () => onLoad();
  img.src = group.dataUrl;
  cache.set(group.id, img);
  return img.complete ? img : null;
}

/** Drop a cached image (e.g. on delete or PDF re-render). */
export function invalidateMediaImage(id: number): void {
  cache.delete(id);
}

/** Clear everything (on note switch). */
export function clearMediaCache(): void {
  cache.clear();
}
