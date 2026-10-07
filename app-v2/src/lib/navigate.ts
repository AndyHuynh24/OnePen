// ─────────────────────────────────────────────────────────────────────────────
// Cross-note navigation — open a note by path and optionally center the viewport
// on a target bbox (used by the reminder panel to jump to the tagged strokes).
// ─────────────────────────────────────────────────────────────────────────────

import { note } from '$stores/note.svelte';
import { history } from '$stores/history.svelte';
import { viewport } from '$stores/viewport.svelte';
import { selection } from '$stores/selection.svelte';
import { annot } from '$stores/annot.svelte';
import { embed } from '$stores/embed.svelte';
import { scrollSignal } from '$stores/scroll.svelte';
import { getEngine } from '$canvas/engineRef';
import { loadNote } from '$persistence/notes';
import { flushNow } from '$persistence/autosave';
import { clearMediaCache } from '$canvas/media/cache';
import type { BBox } from '$types/geometry';

function center(target: BBox) {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  viewport.setOffset({
    x: cx - viewport.screenW / (2 * viewport.scale),
    y: cy - viewport.screenH / (2 * viewport.scale),
  });
}

/** Open `path` into the canvas; if `target` is given, center the view on it once
 *  the new content's pan bounds have settled. Returns false if the note is gone. */
export async function openNoteAndCenter(path: string, target?: BBox): Promise<boolean> {
  // persist pending edits to the note we're leaving
  if (note.path && note.dirty) await flushNow();

  const rec = await loadNote(path);
  if (!rec) return false;

  // tear down per-note transient UI
  selection.clear();
  annot.clear();
  embed.close();
  clearMediaCache();

  note.set(rec.content, rec.path, !!rec.isSummaryNote);
  history.clear();

  if (target) {
    // content bounds update via a CanvasView effect after this state change, so
    // defer centering two frames to land after the re-clamp.
    requestAnimationFrame(() => requestAnimationFrame(() => center(target)));
  }
  return true;
}

let scrollRAF: number | null = null;

/** Smoothly scroll the (already-open) note so `target` sits centered horizontally
 *  with a comfortable margin above it. Used by the TOC to jump to a heading. */
export function scrollToBBox(target: BBox, opts: { topMargin?: number } = {}): void {
  if (scrollRAF !== null) cancelAnimationFrame(scrollRAF);
  const margin = opts.topMargin ?? 80;
  const destX = target.x + target.w / 2 - viewport.screenW / (2 * viewport.scale);
  const destY = target.y - margin / viewport.scale;
  const fromX = viewport.offset.x;
  const fromY = viewport.offset.y;
  const dur = 380;
  let start = -1;

  const step = (t: number) => {
    if (start < 0) start = t;
    const p = Math.min((t - start) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    viewport.setOffset({ x: fromX + (destX - fromX) * ease, y: fromY + (destY - fromY) * ease });
    scrollSignal.pingScroll();
    getEngine()?.invalidateAll();
    if (p < 1) scrollRAF = requestAnimationFrame(step);
    else scrollRAF = null;
  };
  scrollRAF = requestAnimationFrame(step);
}
