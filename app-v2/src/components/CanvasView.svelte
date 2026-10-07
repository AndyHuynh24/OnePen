<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { CanvasEngine } from '$canvas/engine';
  import { attachPointer } from '$input/pointer';
  import { attachWheel } from '$input/wheel';
  import { note } from '$stores/note.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { tools } from '$stores/tools.svelte';
  import { draw } from '$stores/draw.svelte';
  import { history } from '$stores/history.svelte';
  import { undo as undoAction } from '$lib/undo';
  import { clipboard } from '$stores/clipboard.svelte';
  import { moveMode } from '$stores/move.svelte';
  import { selection } from '$stores/selection.svelte';
  import { embed } from '$stores/embed.svelte';
  import { annot } from '$stores/annot.svelte';
  import { mathVerify } from '$stores/mathVerify.svelte';
  import { grid } from '$stores/grid.svelte';
  import { theme } from '$stores/theme.svelte';
  import { clearMediaCache } from '$canvas/media/cache';
  import { setEngine } from '$canvas/engineRef';
  import { setSetting, SETTING_KEYS } from '$persistence/settings';

  let host: HTMLDivElement;
  let bgEl: HTMLCanvasElement;
  let drawEl: HTMLCanvasElement;
  let liveEl: HTMLCanvasElement;
  let engine: CanvasEngine | null = null;

  function size() {
    return {
      w: host?.clientWidth || window.innerWidth,
      h: host?.clientHeight || window.innerHeight,
    };
  }

  onMount(() => {
    engine = new CanvasEngine({
      background: bgEl,
      draw: drawEl,
      live: liveEl,
      getSize: size,
    });
    setEngine(engine);
    // apply the persisted grid layout to the fresh engine
    engine.gridStyle = grid.style;
    engine.gridSize = grid.size;

    const pointer = attachPointer(liveEl, engine);
    const wheel = attachWheel(liveEl, engine);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mathVerify.id !== null) {
          mathVerify.close();
        } else if (embed.open) {
          embed.close();
        } else if (annot.linkEditId !== null || annot.stickyId !== null) {
          annot.clear();
        } else if (selection.id !== null) {
          selection.clear();
          engine?.invalidateLive();
        } else if (clipboard.pasting || moveMode.active) {
          // cancel the in-flight paste / move (placing new text removes it)
          undoAction();
        }
      }
    };
    window.addEventListener('keydown', onKey);

    const ro = new ResizeObserver(() => engine?.resize());
    ro.observe(host);

    return () => {
      pointer.detach();
      wheel.detach();
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      setEngine(null);
      engine?.dispose();
    };
  });

  // Reactivity bridges: redraw layers when stores change.
  $effect(() => {
    void note.groups; // subscribe
    void history.depth;
    untrack(() => engine?.invalidateDraw());
  });

  // grid layout (style + size + colors) → engine background. Re-runs when the
  // theme changes too (resolvedBg/resolvedLine read the live tokens).
  $effect(() => {
    const style = grid.style;
    const size = grid.size;
    void grid.bgColor;
    void grid.lineColor;
    void theme.current; // re-resolve theme defaults on toggle
    untrack(() => {
      if (!engine) return;
      engine.gridStyle = style;
      engine.gridSize = size;
      engine.gridColor = grid.resolvedLine;
      engine.backgroundColor = grid.bgColor ?? ''; // '' → transparent (canvas-bg CSS shows through)
      engine.invalidateBackground();
    });
  });

  $effect(() => {
    void viewport.scale;
    void viewport.offset;
    untrack(() => engine?.invalidateAll());
  });

  // Feed the content extent (all four edges) to the viewport so panning is
  // bounded to content ± a 1vw/1vh margin on every side. The origin (0,0) is
  // always included so a fresh note sits at the top-left and never snaps.
  $effect(() => {
    const groups = note.groups;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    for (const g of groups) {
      if (!g.bbox) continue;
      if (g.bbox.x < minX) minX = g.bbox.x;
      if (g.bbox.y < minY) minY = g.bbox.y;
      if (g.bbox.x + g.bbox.w > maxX) maxX = g.bbox.x + g.bbox.w;
      if (g.bbox.y + g.bbox.h > maxY) maxY = g.bbox.y + g.bbox.h;
    }
    untrack(() => viewport.setContentBounds(minX, minY, maxX, maxY));
  });

  // NOTE: deliberately does NOT depend on draw.live — the in-progress stroke is
  // rendered imperatively (pointer handlers call engine.invalidateLive() per
  // move). Subscribing here would re-fire a redundant invalidate on every sample.
  $effect(() => {
    void draw.eraserPos;
    void tools.penColor;
    void tools.penSize;
    void clipboard.pasting;
    void moveMode.active;
    void selection.id;
    untrack(() => engine?.invalidateLive());
  });

  // Remember the open note + where you were looking in it, so a relaunch reopens
  // the same spot. Debounced: pan/zoom fire this every frame.
  $effect(() => {
    const path = note.path;
    const scale = viewport.scale;
    const { x, y } = viewport.offset;
    if (!path) return;
    const t = setTimeout(() => {
      void setSetting(SETTING_KEYS.LAST_SAVE_NOTE, { path, viewportOffset: { x, y }, scale });
    }, 500);
    return () => clearTimeout(t);
  });

  // Clear the media image cache + selection when switching notes.
  $effect(() => {
    void note.path;
    untrack(() => {
      clearMediaCache();
      selection.clear();
      annot.clear();
      embed.close();
      mathVerify.close();
    });
  });
</script>

<div bind:this={host} class="canvas-host">
  <canvas bind:this={bgEl} class="layer bg"></canvas>
  <canvas bind:this={drawEl} class="layer draw"></canvas>
  <canvas bind:this={liveEl} class="layer live"></canvas>
</div>

<style>
  .canvas-host {
    position: absolute;
    inset: 0;
    background: var(--canvas-bg);
    overflow: hidden;
    touch-action: none;
  }

  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    /* Each canvas gets its own compositor layer so an update to one (live ink every
       move, the draw layer's incremental stroke append on pen-up) re-uploads only
       that texture's dirty rect, instead of repainting the root/overlapping canvases.
       translateZ(0) is enough; `will-change` is avoided — it pins all three hi-DPI
       textures in GPU memory and thrashes low-power tablet GPUs. */
    transform: translateZ(0);
  }

  .layer.live {
    pointer-events: auto;
    touch-action: none;
    /* iPad: no text-selection / callout / loupe on a long Pencil or finger press */
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    /* small solid gray dot (OneNote-style), hotspot at center */
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Ccircle cx='4' cy='4' r='2.4' fill='%23808080'/%3E%3C/svg%3E") 4 4, crosshair;
  }
</style>
