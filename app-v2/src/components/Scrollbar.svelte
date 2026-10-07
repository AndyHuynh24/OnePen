<script lang="ts">
  // Vertical position indicator on the right edge. Auto-hides ~1.2s after
  // scrolling stops. Thumb height/position derive from content extent vs the
  // current viewport (ported from the original scrollbar geometry).
  import { viewport } from '$stores/viewport.svelte';
  import { note } from '$stores/note.svelte';
  import { scrollSignal } from '$stores/scroll.svelte';

  const TRACK_FRACTION = 0.86;

  // Content extent (topmost → bottommost stroke). Depends only on the note —
  // NOT on scrolling — so it's computed once per edit, not once per scroll event.
  const extent = $derived.by(() => {
    let top = Infinity;
    let bottom = -Infinity;
    for (const g of note.groups) {
      if (!g.bbox) continue;
      if (g.bbox.y < top) top = g.bbox.y;
      if (g.bbox.y + g.bbox.h > bottom) bottom = g.bbox.y + g.bbox.h;
    }
    return isFinite(top) ? { top, bottom } : null;
  });

  const geom = $derived.by(() => {
    const vh = viewport.screenH;
    const top = extent?.top ?? 0;
    const bottom = extent?.bottom ?? vh;

    // total scrollable height = content extent + one screen of room below it
    const contentHeight = Math.max(bottom - top + vh, vh);
    const trackH = vh * TRACK_FRACTION;
    const thumbH = Math.max(Math.min((vh / contentHeight) * trackH, trackH), 24);
    const maxScroll = contentHeight - vh; // = bottom - top
    const ratio = maxScroll > 0 ? (viewport.offset.y - top) / maxScroll : 0;
    const thumbTop = Math.max(0, Math.min(1, ratio)) * (trackH - thumbH);
    return { trackH, thumbH, thumbTop };
  });
</script>

<div class="scrollbar" class:visible={scrollSignal.scrollActive} style="height: {geom.trackH}px;">
  <div class="thumb" style="height: {geom.thumbH}px; top: {geom.thumbTop}px;"></div>
</div>

<style>
  .scrollbar {
    position: fixed;
    right: 5px;
    top: 7vh;
    width: 8px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--surface-fg) 6%, transparent);
    z-index: 25;
    opacity: 0;
    transition: opacity var(--dur-base) var(--ease-out);
    pointer-events: none;
  }
  .scrollbar.visible {
    opacity: 1;
  }
  .thumb {
    position: absolute;
    left: 0;
    width: 100%;
    border-radius: 4px;
    background: color-mix(in oklab, var(--surface-fg) 28%, transparent);
  }
</style>
