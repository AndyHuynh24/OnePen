<script lang="ts">
  // Modal crop overlay. Dims everything except a draggable/resizable crop
  // rectangle over the selected media. On Done it composes a normalized source
  // crop and shrinks the media's bbox to the kept region (in place).
  import { note } from '$stores/note.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { crop } from '$stores/crop.svelte';
  import { history } from '$stores/history.svelte';
  import { markDirty } from '$persistence/autosave';
  import type { Group } from '$types/group';

  const MIN = 24; // min crop size in screen px

  const group = $derived.by<Group | null>(() => {
    if (!crop.active) return null;
    const g = note.view(crop.mediaId);
    return g && g.type === 'media' ? g : null;
  });

  // media rect in screen pixels (stable while the modal is open)
  const mediaRect = $derived.by(() => {
    const g = group;
    if (!g) return { x: 0, y: 0, w: 0, h: 0 };
    return {
      x: (g.bbox.x - viewport.offset.x) * viewport.scale,
      y: (g.bbox.y - viewport.offset.y) * viewport.scale,
      w: g.bbox.w * viewport.scale,
      h: g.bbox.h * viewport.scale,
    };
  });

  // crop bounds = the media rect intersected with the screen (so handles are
  // always grabbable even when the media is bigger than the viewport)
  function bounds() {
    const m = mediaRect;
    const pad = 6;
    const x = Math.max(m.x, pad);
    const y = Math.max(m.y, pad);
    const x2 = Math.min(m.x + m.w, window.innerWidth - pad);
    const y2 = Math.min(m.y + m.h, window.innerHeight - pad);
    return { x, y, w: Math.max(MIN, x2 - x), h: Math.max(MIN, y2 - y) };
  }

  // working crop rectangle (screen px); initialized to the visible media on open
  let rect = $state({ x: 0, y: 0, w: 0, h: 0 });
  let lastId = $state<number | null>(null);
  $effect(() => {
    if (crop.mediaId !== null && crop.mediaId !== lastId) {
      lastId = crop.mediaId;
      rect = bounds();
    }
    if (crop.mediaId === null) lastId = null;
  });

  type Drag =
    | { kind: 'move'; px: number; py: number; start: { x: number; y: number } }
    | { kind: 'resize'; handle: 'nw' | 'ne' | 'sw' | 'se'; px: number; py: number; start: { x: number; y: number; w: number; h: number } };
  let drag: Drag | null = null;

  function clampRect(r: { x: number; y: number; w: number; h: number }) {
    const m = bounds();
    r.w = Math.max(MIN, Math.min(r.w, m.w));
    r.h = Math.max(MIN, Math.min(r.h, m.h));
    r.x = Math.max(m.x, Math.min(r.x, m.x + m.w - r.w));
    r.y = Math.max(m.y, Math.min(r.y, m.y + m.h - r.h));
    return r;
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    const m = bounds();
    if (drag.kind === 'move') {
      rect = clampRect({ x: drag.start.x + dx, y: drag.start.y + dy, w: rect.w, h: rect.h });
    } else {
      const s = drag.start;
      let { x, y, w, h } = s;
      if (drag.handle === 'se') {
        w = s.w + dx;
        h = s.h + dy;
      } else if (drag.handle === 'sw') {
        x = s.x + dx;
        w = s.w - dx;
        h = s.h + dy;
      } else if (drag.handle === 'ne') {
        y = s.y + dy;
        w = s.w + dx;
        h = s.h - dy;
      } else {
        x = s.x + dx;
        y = s.y + dy;
        w = s.w - dx;
        h = s.h - dy;
      }
      // keep within the media + min size
      if (w < MIN) {
        if (drag.handle === 'sw' || drag.handle === 'nw') x = s.x + s.w - MIN;
        w = MIN;
      }
      if (h < MIN) {
        if (drag.handle === 'ne' || drag.handle === 'nw') y = s.y + s.h - MIN;
        h = MIN;
      }
      x = Math.max(m.x, x);
      y = Math.max(m.y, y);
      w = Math.min(w, m.x + m.w - x);
      h = Math.min(h, m.y + m.h - y);
      rect = { x, y, w, h };
    }
  }
  function onUp() {
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  function startMove(e: PointerEvent) {
    e.stopPropagation();
    drag = { kind: 'move', px: e.clientX, py: e.clientY, start: { x: rect.x, y: rect.y } };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function startResize(e: PointerEvent, handle: 'nw' | 'ne' | 'sw' | 'se') {
    e.stopPropagation();
    drag = { kind: 'resize', handle, px: e.clientX, py: e.clientY, start: { ...rect } };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function done() {
    const g = group;
    if (!g) return;
    const sc = viewport.scale;
    const off = viewport.offset;
    // crop rect → world
    const cw = { x: rect.x / sc + off.x, y: rect.y / sc + off.y, w: rect.w / sc, h: rect.h / sc };
    const b = g.bbox;
    const fx = Math.max(0, (cw.x - b.x) / b.w);
    const fy = Math.max(0, (cw.y - b.y) / b.h);
    const fw = Math.min(1 - fx, cw.w / b.w);
    const fh = Math.min(1 - fy, cw.h / b.h);
    const ex = g.crop ?? { sx: 0, sy: 0, sw: 1, sh: 1 };

    history.capture();
    g.crop = {
      sx: ex.sx + fx * ex.sw,
      sy: ex.sy + fy * ex.sh,
      sw: ex.sw * fw,
      sh: ex.sh * fh,
    };
    g.bbox = { x: cw.x, y: cw.y, w: cw.w, h: cw.h };
    g.stroke = [
      { x: cw.x, y: cw.y },
      { x: cw.x + cw.w, y: cw.y },
      { x: cw.x + cw.w, y: cw.y + cw.h },
      { x: cw.x, y: cw.y + cw.h },
    ];
    note.commit();
    markDirty();
    crop.end();
  }
  function reset() {
    if (!group) return;
    rect = bounds(); // back to the full visible media
  }
  function cancel() {
    crop.end();
  }
</script>

{#if group}
  <div class="crop-layer">
    <div
      class="crop-rect"
      style="left:{rect.x}px; top:{rect.y}px; width:{rect.w}px; height:{rect.h}px;"
      role="presentation"
      onpointerdown={startMove}
    >
      <span class="grid v1"></span><span class="grid v2"></span>
      <span class="grid h1"></span><span class="grid h2"></span>
      <button class="h nw" aria-label="Crop top-left" onpointerdown={(e) => startResize(e, 'nw')}></button>
      <button class="h ne" aria-label="Crop top-right" onpointerdown={(e) => startResize(e, 'ne')}></button>
      <button class="h sw" aria-label="Crop bottom-left" onpointerdown={(e) => startResize(e, 'sw')}></button>
      <button class="h se" aria-label="Crop bottom-right" onpointerdown={(e) => startResize(e, 'se')}></button>
    </div>

    <div class="crop-bar">
      <span class="title"><i class="bx bx-crop"></i> Crop</span>
      <button class="ghost" onclick={reset}>Reset</button>
      <button class="ghost" onclick={cancel}>Cancel</button>
      <button class="primary" onclick={done}>Apply</button>
    </div>
  </div>
{/if}

<style>
  .crop-layer {
    position: fixed;
    inset: 0;
    z-index: 160;
    font-family: var(--font-ui);
  }
  .crop-rect {
    position: absolute;
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.55);
    border: 1.5px solid #fff;
    cursor: move;
    touch-action: none;
  }
  .grid {
    position: absolute;
    background: rgba(255, 255, 255, 0.4);
    pointer-events: none;
  }
  .grid.v1 { left: 33.33%; top: 0; bottom: 0; width: 1px; }
  .grid.v2 { left: 66.66%; top: 0; bottom: 0; width: 1px; }
  .grid.h1 { top: 33.33%; left: 0; right: 0; height: 1px; }
  .grid.h2 { top: 66.66%; left: 0; right: 0; height: 1px; }
  .h {
    position: absolute;
    width: 22px;
    height: 22px;
    background: #fff;
    border: 1px solid #888;
    border-radius: 50%;
    touch-action: none;
  }
  .h.nw { left: -11px; top: -11px; cursor: nwse-resize; }
  .h.ne { right: -11px; top: -11px; cursor: nesw-resize; }
  .h.sw { left: -11px; bottom: -11px; cursor: nesw-resize; }
  .h.se { right: -11px; bottom: -11px; cursor: nwse-resize; }

  .crop-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-lg);
  }
  .crop-bar .title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--surface-fg);
    font-size: 0.85rem;
    font-weight: 600;
    margin-right: 6px;
  }
  .crop-bar button {
    padding: 7px 14px;
    border-radius: var(--radius-pill);
    font-size: 0.84rem;
    font-weight: 500;
  }
  .ghost {
    color: var(--surface-fg-muted);
  }
  .ghost:hover {
    background: var(--surface-raised);
    color: var(--surface-fg);
  }
  .primary {
    background: var(--accent);
    color: var(--accent-fg);
  }
  .primary:hover {
    background: color-mix(in oklab, var(--accent) 92%, white);
  }
</style>
