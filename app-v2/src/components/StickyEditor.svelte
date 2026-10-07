<script lang="ts">
  // Sticky-note popup — a small hand-drawing surface (like the original), opened
  // when a sticky annotation is created or tapped. Strokes are stored on the
  // group as `noteStrokes` in popup-local coordinates. Anchored to its strokes
  // on the canvas (a dashed-box hint); not draggable.
  import { note } from '$stores/note.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { annot } from '$stores/annot.svelte';
  import { history } from '$stores/history.svelte';
  import { markDirty } from '$persistence/autosave';
  import { CONFIG } from '$config/constants';
  import type { Group } from '$types/group';
  import type { Stroke } from '$types/geometry';

  const W = 240;
  const H = 210;
  const CANVAS_H = H - 78; // leave room for header + toolbar

  const group = $derived.by<Group | null>(() => {
    if (annot.stickyId === null) return null;
    const g = note.view(annot.stickyId);
    return g && g.type === 'stickynote' ? g : null;
  });

  // anchor above the strokes, flipping below if it would clip the top
  const pos = $derived.by(() => {
    const g = group;
    if (!g) return { x: 0, y: 0 };
    const sx = (g.bbox.x - viewport.offset.x) * viewport.scale;
    const sy = (g.bbox.y - viewport.offset.y) * viewport.scale;
    const sh = g.bbox.h * viewport.scale;
    let top = sy - H - 8;
    if (top < 8) top = sy + sh + 8;
    const left = Math.max(8, Math.min(sx + (g.bbox.w * viewport.scale) / 2 - W / 2, window.innerWidth - W - 8));
    return { x: left, y: Math.min(top, window.innerHeight - H - 8) };
  });

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let erasing = $state(false);
  let drawingId = $state<number | null>(null); // active pointer id
  let live: Stroke = [];

  const INK = '#2a2620';
  const PEN_W = 2.2;
  const ERASE_R = 12;

  function redraw() {
    const g = group;
    const c = canvasEl;
    if (!g || !c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, CANVAS_H);
    const all = [...(g.noteStrokes ?? [])];
    if (live.length) all.push(live);
    ctx.strokeStyle = INK;
    ctx.lineWidth = PEN_W;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of all) {
      if (s.length < 2) {
        if (s.length === 1) {
          ctx.beginPath();
          ctx.arc(s[0].x, s[0].y, PEN_W / 2, 0, Math.PI * 2);
          ctx.fillStyle = INK;
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    }
  }

  // size the backing store for HiDPI + render whenever the note changes
  $effect(() => {
    const c = canvasEl;
    if (!c) return;
    void group?.id;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = CANVAS_H * dpr;
    redraw();
  });

  function localPt(e: PointerEvent) {
    const r = canvasEl!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // the current eraser drag already opened its undo step
  let eraseCaptured = false;
  function eraseAt(x: number, y: number) {
    const g = group;
    if (!g || !g.noteStrokes) return;
    const hit = (s: Stroke) => s.some((p) => Math.hypot(p.x - x, p.y - y) <= ERASE_R);
    if (!g.noteStrokes.some(hit)) return;
    if (!eraseCaptured) {
      history.capture();
      eraseCaptured = true;
    }
    g.noteStrokes = g.noteStrokes.filter((s) => !hit(s));
  }

  // Geometric scribble (delete-gesture) detector: a back-and-forth zig-zag with
  // several X-direction reversals over a path much longer than its bbox. Matches
  // the "scratch it out" gesture without needing the TF model in the popup.
  function looksLikeScribble(s: Stroke): boolean {
    if (s.length < 8) return false;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let len = 0;
    let reversals = 0;
    let dir = 0;
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (i > 0) {
        const dx = s[i].x - s[i - 1].x;
        len += Math.hypot(dx, s[i].y - s[i - 1].y);
        const nd = dx > 1 ? 1 : dx < -1 ? -1 : 0;
        if (nd !== 0 && dir !== 0 && nd !== dir) reversals++;
        if (nd !== 0) dir = nd;
      }
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const diag = Math.hypot(w, h) || 1;
    // dense back-and-forth: many reversals, mostly horizontal, very folded path
    return reversals >= 4 && w > h * 0.8 && len > diag * 2.5;
  }

  function strokeBBox(s: Stroke) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }

  /** Delete note-strokes the scribble passes over. Returns how many were removed. */
  function deleteByScribble(scribble: Stroke): number {
    const g = group;
    if (!g || !g.noteStrokes) return 0;
    const sb = strokeBBox(scribble);
    const before = g.noteStrokes.length;
    g.noteStrokes = g.noteStrokes.filter((s) => {
      const b = strokeBBox(s);
      const overlaps =
        b.minX <= sb.maxX && b.maxX >= sb.minX && b.minY <= sb.maxY && b.maxY >= sb.minY;
      if (!overlaps) return true;
      // keep unless a scribble point lands near one of this stroke's points
      const hit = scribble.some((sp) => s.some((p) => Math.hypot(p.x - sp.x, p.y - sp.y) <= 14));
      return !hit;
    });
    return before - g.noteStrokes.length;
  }

  function down(e: PointerEvent) {
    const g = group;
    if (!g) return;
    canvasEl!.setPointerCapture(e.pointerId);
    drawingId = e.pointerId;
    eraseCaptured = false;
    const p = localPt(e);
    if (erasing) {
      eraseAt(p.x, p.y);
      redraw();
    } else {
      live = [{ x: p.x, y: p.y }];
    }
  }
  function move(e: PointerEvent) {
    if (drawingId !== e.pointerId) return;
    const p = localPt(e);
    if (erasing) {
      eraseAt(p.x, p.y);
    } else {
      live.push({ x: p.x, y: p.y });
    }
    redraw();
  }
  function up(e: PointerEvent) {
    if (drawingId !== e.pointerId) return;
    drawingId = null;
    const g = group;
    if (g && !erasing && live.length) {
      history.capture(); // each sticky stroke (or scribble-delete) is one undo step
      // scribble over existing strokes → delete them instead of adding ink
      if (looksLikeScribble(live) && deleteByScribble(live) > 0) {
        // consumed as a delete gesture
      } else {
        g.noteStrokes = [...(g.noteStrokes ?? []), live];
      }
    }
    live = [];
    note.commit();
    markDirty();
    redraw();
  }

  function clearAll() {
    const g = group;
    if (!g || !g.noteStrokes?.length) return;
    history.capture();
    g.noteStrokes = [];
    note.commit();
    markDirty();
    redraw();
  }
  function del() {
    const g = group;
    if (!g) return;
    history.capture();
    note.setGroups(note.groups.filter((x) => x.id !== g.id));
    markDirty();
    annot.closeSticky();
  }
  function close() {
    annot.closeSticky();
  }
</script>

{#if group}
  {@const g = group}
  <div
    class="se"
    style="left: {pos.x}px; top: {pos.y}px; width: {W}px; height: {H}px; --paper: {g.color || CONFIG.STICKY.COLORS[0]};"
  >
    <header>
      <span>Sticky note</span>
      <button class="x" onclick={close} aria-label="Done"><i class="bx bx-check"></i></button>
    </header>

    <canvas
      bind:this={canvasEl}
      style="width: {W}px; height: {CANVAS_H}px;"
      class:erase={erasing}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    ></canvas>

    <div class="bar">
      <button class:active={!erasing} onclick={() => (erasing = false)} aria-label="Pen"><i class="bx bx-pen"></i></button>
      <button class:active={erasing} onclick={() => (erasing = true)} aria-label="Eraser"><i class="bx bx-eraser"></i></button>
      <button onclick={clearAll} aria-label="Clear"><i class="bx bx-trash-alt"></i></button>
      <span class="spacer"></span>
      <button class="del" onclick={del} aria-label="Delete note"><i class="bx bx-trash"></i></button>
    </div>
  </div>
{/if}

<style>
  .se {
    position: fixed;
    z-index: 140;
    background: var(--paper);
    border: 1px solid color-mix(in oklab, var(--paper) 70%, black 12%);
    border-radius: 12px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-ui);
    animation: seIn var(--dur-fast) var(--ease-out);
  }
  @keyframes seIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px; font-size: 0.72rem; font-weight: 700;
    color: rgba(0,0,0,0.55); text-transform: uppercase; letter-spacing: 0.03em;
    background: rgba(0,0,0,0.04);
  }
  .x { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--radius-sm); color: rgba(0,0,0,0.5); }
  .x:hover { background: rgba(0,0,0,0.1); color: rgba(0,0,0,0.8); }
  canvas {
    display: block;
    background: rgba(255,255,255,0.45);
    touch-action: none;
    /* small solid gray dot (OneNote-style), matching the main canvas */
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Ccircle cx='4' cy='4' r='2.4' fill='%23808080'/%3E%3C/svg%3E") 4 4, crosshair;
  }
  canvas.erase { cursor: cell; }
  .bar {
    display: flex; align-items: center; gap: 4px;
    padding: 6px 8px; background: rgba(0,0,0,0.04);
  }
  .bar button {
    width: 30px; height: 28px; display: grid; place-items: center;
    border-radius: var(--radius-sm); color: rgba(0,0,0,0.6);
  }
  .bar button:hover { background: rgba(0,0,0,0.08); }
  .bar button.active { background: rgba(0,0,0,0.14); color: rgba(0,0,0,0.9); }
  .spacer { flex: 1; }
  .bar button.del:hover { color: var(--danger); background: color-mix(in oklab, var(--danger) 14%, transparent); }
</style>
