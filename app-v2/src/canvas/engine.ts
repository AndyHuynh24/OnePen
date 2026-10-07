// ─────────────────────────────────────────────────────────────────────────────
// CanvasEngine — owns the three canvases + the rAF render loop.
// Strictly imperative: no Svelte reactivity inside the engine. Components
// subscribe via the stores and call `engine.invalidate()` to schedule a redraw.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';
import { note } from '$stores/note.svelte';
import { viewport } from '$stores/viewport.svelte';
import { tools } from '$stores/tools.svelte';
import { draw } from '$stores/draw.svelte';
import { clipboard } from '$stores/clipboard.svelte';
import { moveMode } from '$stores/move.svelte';
import { selection } from '$stores/selection.svelte';
import { applyViewportTransform, dpr, setupHiDPICanvas } from './transform';
import { intersectBBox, getBoundingBox } from './hitTest';
import { drawGrid, type GridStyle } from './render/grid';
import { drawStroke, drawStrokeRegion } from './render/stroke';
import { drawHighlight } from './render/highlight';
import { drawTextGroup } from './render/text';
import { drawMediaGroup, drawMediaSelection } from './render/media';
import { drawStickyHint } from './render/sticky';
import { drawLinkHint } from './render/link';
import { drawTapeGroup } from './render/tape';
import { drawReminderBadge } from './render/reminder';
import { getMediaImage } from './media/cache';
import { drawDashedBox } from './render/box';
import { drawEraserIndicator } from './render/eraser';
import { perf } from '$lib/perf';

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** bbox of pts[from..], unioned with `base` (if any) */
function boxOf(pts: { x: number; y: number }[], from: number, base: Box | null): Box {
  const b: Box = base
    ? { ...base }
    : { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = from; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < b.minX) b.minX = p.x;
    if (p.x > b.maxX) b.maxX = p.x;
    if (p.y < b.minY) b.minY = p.y;
    if (p.y > b.maxY) b.maxY = p.y;
  }
  return b;
}

export interface EngineOptions {
  background: HTMLCanvasElement;
  draw: HTMLCanvasElement;
  live: HTMLCanvasElement;
  /** screen size in CSS px; engine reads from this on resize */
  getSize: () => { w: number; h: number };
}

export class CanvasEngine {
  private readonly bgCanvas: HTMLCanvasElement;
  private readonly drawCanvas: HTMLCanvasElement;
  private readonly liveCanvas: HTMLCanvasElement;
  private readonly bgCtx: CanvasRenderingContext2D;
  private readonly drawCtx: CanvasRenderingContext2D;
  /** where everything "live" is drawn — the visible live canvas, or (low-latency
   *  mode) an offscreen buffer that presentLive() copies to it in one operation */
  private readonly liveCtx: CanvasRenderingContext2D;
  private readonly liveOut: CanvasRenderingContext2D;
  private readonly liveBuf: HTMLCanvasElement | null = null;
  /** the browser granted a desynchronized (low-latency) live canvas */
  readonly lowLatency: boolean;
  private readonly getSize: () => { w: number; h: number };

  private rafId: number | null = null;
  private dirty = { bg: true, draw: true, live: true };

  // Incremental-commit tracking for the draw layer. Records the groups array +
  // viewport at the last render. When the ONLY change is plain strokes appended
  // (same prefix, same viewport, no top-layer annotations), renderDraw paints just
  // the new strokes instead of clearing + redrawing the whole note — this is what
  // keeps fast handwriting (many rapid short strokes) cheap. groups=null forces full.
  private _lastDraw: {
    groups: Group[] | null;
    count: number;
    scale: number;
    offX: number;
    offY: number;
  } = { groups: null, count: 0, scale: NaN, offX: NaN, offY: NaN };

  // draw.live gained samples since the last paint (see requestLiveStroke)
  private _liveStrokeDirty = false;
  // incremental wet-ink paint: body length + tail region at the last paint
  private _paintedBody = 0;
  private _tailBox: Box | null = null;
  // a just-finished stroke is still on the live layer, waiting for the hand-off
  private _wetInk = false;
  // nothing is on the live layer (skip clearing/presenting it every pan frame)
  private _liveEmpty = true;

  // Zoom gesture (pinch / ctrl-wheel): instead of re-rendering every stroke on
  // every zoom step, the last sharp frame is scaled (GPU drawImage) while the
  // fingers move, and the note is re-rendered sharp once the zoom settles.
  private _zoomGesture = false;
  private _zoomTimer: ReturnType<typeof setTimeout> | null = null;
  private _zoomSnap: HTMLCanvasElement | null = null;
  private _snapView: { scale: number; offX: number; offY: number } | null = null;

  // grid config (mutable so settings can update without re-creating engine)
  gridSize = 58;
  gridColor = 'rgba(21,59,87, 1)';
  gridStyle: GridStyle = 'square';
  backgroundColor = '';

  constructor(opts: EngineOptions) {
    this.bgCanvas = opts.background;
    this.drawCanvas = opts.draw;
    this.liveCanvas = opts.live;
    this.getSize = opts.getSize;

    this.bgCtx = this.assertCtx(this.bgCanvas.getContext('2d'));
    this.drawCtx = this.assertCtx(this.drawCanvas.getContext('2d'));
    // Low-latency wet ink: a `desynchronized` canvas skips the compositor, so a
    // draw shows up on screen right away instead of a frame or two later (what
    // native ink like OneNote gets). Desync shows every draw call AS IT HAPPENS,
    // though, so drawing clear+redraw straight onto it flickers (an earlier attempt
    // did). Instead everything is drawn on an offscreen buffer and copied over in
    // ONE drawImage (presentLive) — the screen only ever sees finished frames.
    // Browsers without desync (iPad Safari) draw directly; nothing else changes.
    this.liveOut = this.assertCtx(this.liveCanvas.getContext('2d', { desynchronized: true }));
    this.lowLatency = this.liveOut.getContextAttributes?.()?.desynchronized === true;
    if (this.lowLatency) {
      this.liveBuf = document.createElement('canvas');
      this.liveCtx = this.assertCtx(this.liveBuf.getContext('2d'));
    } else {
      this.liveCtx = this.liveOut;
    }

    this.resize();
  }

  private assertCtx(ctx: CanvasRenderingContext2D | null): CanvasRenderingContext2D {
    if (!ctx) throw new Error('2D context not available');
    return ctx;
  }

  resize(): void {
    const { w, h } = this.getSize();
    setupHiDPICanvas(this.bgCanvas, w, h);
    setupHiDPICanvas(this.drawCanvas, w, h);
    setupHiDPICanvas(this.liveCanvas, w, h);
    if (this.liveBuf) setupHiDPICanvas(this.liveBuf, w, h);
    viewport.setScreenSize(w, h);
    this._lastDraw.groups = null; // backing stores were cleared → next draw is full
    this.invalidateAll();
  }

  /** Mark all layers dirty for the next render cycle. */
  invalidateAll(): void {
    this.dirty.bg = true;
    this.dirty.draw = true;
    this.dirty.live = true;
    this.scheduleFrame();
  }

  invalidateLive(): void {
    this.dirty.live = true;
    this.scheduleFrame();
  }

  invalidateDraw(): void {
    this.dirty.draw = true;
    this.scheduleFrame();
  }

  /** Invalidate the draw layer AND drop the incremental-append cache, forcing a
   *  full clear + redraw. Required whenever existing groups are edited IN PLACE
   *  (recolor/resize) — the append path compares object identity, so a mutated
   *  group still looks like an unchanged prefix and would never be repainted. */
  invalidateDrawFull(): void {
    this._lastDraw.groups = null;
    this.dirty.draw = true;
    this.scheduleFrame();
  }

  invalidateBackground(): void {
    this.dirty.bg = true;
    this.scheduleFrame();
  }

  /** A zoom step happened (pinch move / ctrl-wheel). Frames show the scaled last
   *  sharp render until the zoom rests for a moment (or endZoomGesture()). */
  zoomGesture(): void {
    this._zoomGesture = true;
    if (this._zoomTimer !== null) clearTimeout(this._zoomTimer);
    this._zoomTimer = setTimeout(() => this.endZoomGesture(), 140);
    this.invalidateAll();
  }

  /** Zoom finished — re-render the note sharp at the new scale. */
  endZoomGesture(): void {
    if (this._zoomTimer !== null) clearTimeout(this._zoomTimer);
    this._zoomTimer = null;
    if (!this._zoomGesture) return;
    this._zoomGesture = false;
    this._snapView = null;
    this.invalidateAll();
    this.invalidateDrawFull();
  }

  // ── live wet-ink ─────────────────────────────────────────────────────────────
  // Points are smoothed once on input and never change, so between two paints
  // only the stroke's TAIL can differ (the last curve piece + the pen tip). Each
  // paint (once per frame) clears just that small region and redraws the curve
  // pieces inside it — a constant cost, however long the stroke. Same curve
  // pieces as drawStroke() (the committed layer), so pen-up is a seamless hand-off.
  /** Start an in-progress stroke: wipe the live layer once, paint the first dot. */
  beginLiveStroke(): void {
    if (!this._liveEmpty) {
      const ctx = this.liveCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      this.presentLive(null);
    }
    this.dirty.live = false; // the live-stroke path owns the live layer now
    this._wetInk = true;
    this._liveEmpty = false;
    this._paintedBody = 0;
    this._tailBox = null;
    this.requestLiveStroke();
  }

  /** New samples were appended to draw.live — repaint the wet ink next frame.
   *  Once per display frame, never per pen event: a high-rate pen (Chromium raw
   *  updates, 240Hz+) painting per sample forced a GPU flush per sample, which
   *  stalled the main thread. The screen can't show more than one frame anyway. */
  requestLiveStroke(): void {
    this._liveStrokeDirty = true;
    this.scheduleFrame();
  }

  private paintLiveStroke(): void {
    const pts = draw.live;
    const n = pts.length;
    if (n === 0) return;
    // everything from the first curve piece that could have changed since the
    // last paint, plus whatever the previous tail covered (old pen tip)
    const box = boxOf(pts, Math.max(0, this._paintedBody - 2), this._tailBox);
    const body = draw.bodyLength;
    this._tailBox = boxOf(pts, Math.max(0, body - 2), null);
    this._paintedBody = body;

    // device-pixel-aligned region (half line width + anti-aliasing)
    const sc = viewport.scale;
    const off = viewport.offset;
    const s = sc * dpr;
    const pad = (tools.penSize / 2) * s + 2;
    const x0 = Math.floor((box.minX - off.x) * s - pad);
    const y0 = Math.floor((box.minY - off.y) * s - pad);
    const x1 = Math.ceil((box.maxX - off.x) * s + pad);
    const y1 = Math.ceil((box.maxY - off.y) * s + pad);

    const ctx = this.liveCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyViewportTransform(ctx, sc, off);
    drawStrokeRegion(ctx, pts, { color: tools.penColor, size: tools.penSize }, {
      minX: x0 / s + off.x,
      minY: y0 / s + off.y,
      maxX: x1 / s + off.x,
      maxY: y1 / s + off.y,
    });
    ctx.restore();
    this.presentLive({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }

  /** Low-latency mode: copy the buffer (all of it, or a device-px rect) to the
   *  visible live canvas in one operation, so the screen never shows a half-drawn
   *  frame. No-op when drawing directly. */
  private presentLive(r: { x: number; y: number; w: number; h: number } | null): void {
    const buf = this.liveBuf;
    if (!buf) return;
    const out = this.liveOut;
    let x = 0;
    let y = 0;
    let w = buf.width;
    let h = buf.height;
    if (r) {
      x = Math.max(0, Math.floor(r.x));
      y = Math.max(0, Math.floor(r.y));
      w = Math.min(buf.width, Math.ceil(r.x + r.w)) - x;
      h = Math.min(buf.height, Math.ceil(r.y + r.h)) - y;
      if (w <= 0 || h <= 0) return;
    }
    out.save();
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.beginPath();
    out.rect(x, y, w, h);
    out.clip();
    out.globalCompositeOperation = 'copy';
    out.drawImage(buf, x, y, w, h, x, y, w, h);
    out.restore();
  }

  private scheduleFrame(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  private render(): void {
    if (this.dirty.bg) this.renderBackground();
    if (this.dirty.draw) {
      const _t = performance.now();
      this.renderDraw();
      perf.recordRender(performance.now() - _t);
    }
    // Pen-up hand-off: the committed stroke is drawn on the (normal, composited)
    // draw layer this frame. A low-latency live layer would show its clear
    // IMMEDIATELY — before the draw layer reaches the screen — so the stroke would
    // blink out for a frame. Clear the wet ink one frame later instead.
    const deferLive =
      this.lowLatency && this.dirty.live && this.dirty.draw && this._wetInk && !draw.isDrawing;
    if (deferLive) {
      this._wetInk = false;
      this.dirty = { bg: false, draw: false, live: true };
      this.scheduleFrame();
      return;
    }
    if (this.dirty.live) {
      this.renderLive(); // also redraws any in-progress stroke
      if (!draw.isDrawing) this._wetInk = false;
    }
    else if (this._liveStrokeDirty && draw.isDrawing) this.paintLiveStroke();
    this._liveStrokeDirty = false;
    this.dirty = { bg: false, draw: false, live: false };
  }

  private renderBackground(): void {
    const { w, h } = this.getSize();
    const ctx = this.bgCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.backgroundColor) {
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    applyViewportTransform(ctx, viewport.scale, viewport.offset);
    drawGrid(ctx, viewport.screen, this.gridSize, this.gridColor, this.gridStyle);
  }

  private renderDraw(): void {
    const ctx = this.drawCtx;
    const groups = note.groups;
    const screen = viewport.screen;
    const scale = viewport.scale;
    const off = viewport.offset;
    const ld = this._lastDraw;

    // ── fast append path: only plain strokes were appended with the viewport
    // unchanged. Paint just the new strokes (no clear, no O(note) redraw), then
    // re-stamp the on-top annotations so they keep their z-order over the new ink.
    // Makes every pen-up O(new strokes) instead of O(whole page) — the standard
    // "committed layer" approach, and what keeps continuous writing smooth.
    if (
      ld.groups !== null &&
      ld.scale === scale &&
      ld.offX === off.x &&
      ld.offY === off.y &&
      groups.length > ld.count &&
      !moveMode.active &&
      this.samePrefix(groups, ld.groups, ld.count) &&
      this.appendedAreStrokes(groups, ld.count)
    ) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      applyViewportTransform(ctx, scale, off);
      for (let i = ld.count; i < groups.length; i++) {
        const g = groups[i];
        if (g.visibility === false || !intersectBBox(g.bbox, screen)) continue;
        this.renderGroup(ctx, g);
      }
      this.renderOverlays(ctx, groups, screen, null); // keep tape/sticky/reminders on top
      ld.count = groups.length;
      ld.groups = groups;
      return;
    }

    // ── zoom gesture: show the last sharp frame scaled (see zoomGesture) ─────
    if (this._zoomGesture && !moveMode.active) {
      if (!this._snapView && ld.groups !== null) this.takeZoomSnapshot();
      if (this._snapView) {
        this.drawZoomPreview();
        ld.groups = null; // the layer no longer matches a sharp render
        return;
      }
    }

    // ── scroll: shift the existing pixels, render only the newly exposed strips.
    // Offsets are snapped to whole device pixels (viewport store), so the shift is
    // an exact pixel copy — no resampling, no blur. A scroll frame costs one GPU
    // copy plus the few strokes in the exposed strips, instead of re-rendering
    // every visible stroke.
    const { w, h } = this.getSize();
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (
      ld.groups === groups &&
      ld.count === groups.length &&
      ld.scale === scale &&
      (ld.offX !== off.x || ld.offY !== off.y) &&
      !moveMode.active
    ) {
      const dx = (ld.offX - off.x) * scale * dpr;
      const dy = (ld.offY - off.y) * scale * dpr;
      const rx = Math.round(dx);
      const ry = Math.round(dy);
      if (
        Math.abs(dx - rx) < 0.01 &&
        Math.abs(dy - ry) < 0.01 &&
        Math.abs(rx) < W / 2 &&
        Math.abs(ry) < H / 2
      ) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(this.drawCanvas, rx, ry);
        ctx.restore();
        // exposed strips (device px)
        if (rx > 0) this.paintRegion(groups, 0, 0, rx, H);
        else if (rx < 0) this.paintRegion(groups, W + rx, 0, -rx, H);
        if (ry > 0) this.paintRegion(groups, 0, 0, W, ry);
        else if (ry < 0) this.paintRegion(groups, 0, H + ry, W, -ry);
        ld.offX = off.x;
        ld.offY = off.y;
        return;
      }
    }

    // ── full redraw ──────────────────────────────────────────────────────────
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyViewportTransform(ctx, scale, off);
    // while moving, the selection is drawn on the live layer instead
    const moving = moveMode.active ? new Set(moveMode.selection.map((g) => g.id)) : null;
    this.paintScene(ctx, groups, screen, moving);

    // Remember what we fully rendered, so the next render can take the fast append
    // path when only strokes are added with the viewport unchanged.
    ld.groups = groups;
    ld.count = groups.length;
    ld.scale = scale;
    ld.offX = off.x;
    ld.offY = off.y;
  }

  /** Every pass of the note, in z-order, for groups touching `view` (world). */
  private paintScene(
    ctx: CanvasRenderingContext2D,
    groups: Group[],
    view: BBox,
    moving: Set<number> | null,
  ): void {
    const skip = (g: Group) =>
      g.visibility === false || moving?.has(g.id) || !intersectBBox(g.bbox, view);

    // Pass 1 — text + math results + media behind everything (draw on top).
    for (const group of groups) {
      if (group.type !== 'text' && group.type !== 'math_result' && group.type !== 'media') continue;
      if (skip(group)) continue;
      if (group.type === 'text' || group.type === 'math_result') {
        drawTextGroup(ctx, group);
      } else {
        const img = getMediaImage(group, () => this.invalidateDrawFull());
        if (img) drawMediaGroup(ctx, group, img);
      }
    }

    // Pass 2 — highlights behind strokes.
    for (const group of groups) {
      if (group.type !== 'highlight') continue;
      if (skip(group)) continue;
      drawHighlight(ctx, group.bbox, group.color);
    }

    // Pass 3 — strokes + remaining content on top.
    for (const group of groups) {
      if (
        group.type === 'highlight' ||
        group.type === 'text' ||
        group.type === 'math_result' ||
        group.type === 'media' ||
        group.type === 'stickynote' ||
        group.type === 'link' ||
        group.type === 'tape'
      )
        continue;
      if (skip(group)) continue;
      this.renderGroup(ctx, group);
    }

    // Passes 4-5 — annotations on top of the strokes (tape covers, link/sticky
    // hints, reminder badges). Shared with the append path so z-order is identical.
    this.renderOverlays(ctx, groups, view, moving);
  }

  /** Clear + re-render one device-pixel rect of the draw layer. */
  private paintRegion(groups: Group[], x: number, y: number, w: number, h: number): void {
    const ctx = this.drawCtx;
    const sc = viewport.scale;
    const off = viewport.offset;
    const s = sc * dpr;
    const margin = 48 / sc; // stroke width / badges that poke outside a bbox
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x, y, w, h);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyViewportTransform(ctx, sc, off);
    this.paintScene(
      ctx,
      groups,
      { x: x / s + off.x - margin, y: y / s + off.y - margin, w: w / s + 2 * margin, h: h / s + 2 * margin },
      null,
    );
    ctx.restore();
  }

  private takeZoomSnapshot(): void {
    const src = this.drawCanvas;
    let snap = this._zoomSnap;
    if (!snap) snap = this._zoomSnap = document.createElement('canvas');
    if (snap.width !== src.width || snap.height !== src.height) {
      snap.width = src.width;
      snap.height = src.height;
    }
    const sctx = snap.getContext('2d');
    if (!sctx) return;
    sctx.globalCompositeOperation = 'copy';
    sctx.drawImage(src, 0, 0);
    const ld = this._lastDraw;
    this._snapView = { scale: ld.scale, offX: ld.offX, offY: ld.offY };
  }

  private drawZoomPreview(): void {
    const sv = this._snapView;
    const snap = this._zoomSnap;
    if (!sv || !snap) return;
    const ctx = this.drawCtx;
    const sc = viewport.scale;
    const off = viewport.offset;
    const k = sc / sv.scale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(k, 0, 0, k, (sv.offX - off.x) * sc * dpr, (sv.offY - off.y) * sc * dpr);
    ctx.drawImage(snap, 0, 0);
    ctx.restore();
  }

  /** Draw the on-top annotation passes (tape, link/sticky hints, reminder badges).
   *  Called by the full redraw AND the append path (after new strokes are added) so
   *  these always sit above strokes. `moving` excludes groups being dragged. */
  private renderOverlays(
    ctx: CanvasRenderingContext2D,
    groups: Group[],
    screen: BBox,
    moving: Set<number> | null,
  ): void {
    const skip = (g: Group) =>
      g.visibility === false || moving?.has(g.id) || !intersectBBox(g.bbox, screen);

    // tape covers (opaque), then link + sticky dashed-box hints
    for (const group of groups) {
      if (group.type !== 'tape') continue;
      if (skip(group)) continue;
      drawTapeGroup(ctx, group, viewport.scale);
    }
    for (const group of groups) {
      if (skip(group)) continue;
      if (group.type === 'link') drawLinkHint(ctx, group, viewport.scale, this.accent());
      else if (group.type === 'stickynote') drawStickyHint(ctx, group, viewport.scale);
    }

    // reminder bell badges — one per reminderGroupId, at the union bbox
    const reminders = new Map<string, { bbox: BBox; date: string }>();
    for (const g of groups) {
      if (!g.reminderStatus || g.visibility === false || !g.reminderGroupId || !g.bbox) continue;
      const cur = reminders.get(g.reminderGroupId);
      if (!cur) {
        reminders.set(g.reminderGroupId, { bbox: { ...g.bbox }, date: g.reminderDate ?? '' });
      } else {
        const x2 = Math.max(cur.bbox.x + cur.bbox.w, g.bbox.x + g.bbox.w);
        const y2 = Math.max(cur.bbox.y + cur.bbox.h, g.bbox.y + g.bbox.h);
        cur.bbox.x = Math.min(cur.bbox.x, g.bbox.x);
        cur.bbox.y = Math.min(cur.bbox.y, g.bbox.y);
        cur.bbox.w = x2 - cur.bbox.x;
        cur.bbox.h = y2 - cur.bbox.y;
      }
    }
    const nowMs = Date.now();
    for (const { bbox, date } of reminders.values()) {
      if (!intersectBBox(bbox, screen)) continue;
      const overdue = date ? new Date(date).getTime() < nowMs : false;
      drawReminderBadge(ctx, bbox, viewport.scale, overdue);
    }
  }

  /** The first `n` entries of `cur` are the SAME object refs as `prev` (so the note
   *  only grew at the tail). NOTE: this is identity-only — it does NOT detect a
   *  group edited in place. Code that mutates a group must call
   *  invalidateDrawFull() rather than invalidateDraw(). */
  private samePrefix(cur: Group[], prev: Group[], n: number): boolean {
    if (prev.length < n) return false;
    for (let i = 0; i < n; i++) if (cur[i] !== prev[i]) return false;
    return true;
  }

  /** Every group appended at/after `from` is a plain pen stroke (pass-3 ink) — so
   *  drawing it on top of the existing layer preserves z-order. */
  private appendedAreStrokes(groups: Group[], from: number): boolean {
    for (let i = from; i < groups.length; i++) {
      const t = groups[i].type;
      if (t !== undefined && t !== 'stroke') return false;
    }
    return true;
  }

  private renderLive(): void {
    const sel = selection.group();
    const busy =
      (draw.isDrawing && draw.live.length > 0) ||
      draw.eraserPos !== null ||
      sel?.type === 'media' ||
      (moveMode.active && moveMode.selection.length > 0) ||
      (clipboard.pasting && clipboard.pasteBBox !== null);
    // nothing to show and nothing to erase → leave the layer alone (pan/zoom
    // frames used to clear + present a full-screen empty layer every frame)
    if (!busy && this._liveEmpty) return;
    this._liveEmpty = !busy;

    const ctx = this.liveCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyViewportTransform(ctx, viewport.scale, viewport.offset);

    if (draw.isDrawing && draw.live.length > 0) {
      const pts = draw.live;
      drawStroke(ctx, pts, { color: tools.penColor, size: tools.penSize });
      this._tailBox = boxOf(pts, Math.max(0, draw.bodyLength - 2), null);
      this._paintedBody = draw.bodyLength;
    }

    if (draw.eraserPos) {
      drawEraserIndicator(
        ctx,
        draw.eraserPos.x,
        draw.eraserPos.y,
        tools.eraserSize / 2,
      );
    }

    // selected media card — dashed border + corner resize handles
    if (sel && sel.type === 'media') {
      drawMediaSelection(ctx, sel, viewport.scale);
    }

    // move preview — selection drawn shifted by the accumulated offset (the real
    // groups aren't mutated until commit, so Escape cancels cleanly)
    if (moveMode.active && moveMode.selection.length > 0) {
      const placing = moveMode.placing;
      const box = unionBBox(moveMode.selection);
      ctx.save();
      ctx.translate(moveMode.dx, moveMode.dy);
      for (const g of moveMode.selection) this.previewGroup(ctx, g);
      drawDashedBox(ctx, box, placing ? this.accent() : 'rgba(150,150,150,0.9)', viewport.scale);
      if (placing) {
        ctx.save();
        const fs = 13 / viewport.scale;
        ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = this.accent();
        ctx.textBaseline = 'bottom';
        ctx.fillText('Drag to move · tap outside to place', box.x, box.y - 6 / viewport.scale);
        ctx.restore();
      }
      ctx.restore();
    }

    // paste preview — pasted groups + prominent box + hint label
    if (clipboard.pasting && clipboard.pasteBBox) {
      const b = clipboard.pasteBBox;
      const accent = this.accent();
      const s = viewport.scale;
      const pad = 8;
      for (const g of clipboard.pastedGroups) this.previewGroup(ctx, g);
      drawDashedBox(
        ctx,
        { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 },
        accent,
        s,
      );
      ctx.save();
      const fs = 13 / s;
      ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = accent;
      ctx.textBaseline = 'bottom';
      ctx.fillText('Drag to move · tap outside to place', b.x - pad, b.y - pad - 5 / s);
      ctx.restore();
    }
    this.presentLive(null);
  }

  /** Current --accent color (cached; refreshed when the theme changes). */
  private _accent = '';
  private _accentTheme = '';
  private accent(): string {
    const theme = document.documentElement.dataset.theme ?? '';
    if (theme !== this._accentTheme || !this._accent) {
      this._accentTheme = theme;
      this._accent =
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
        '#5b7493';
    }
    return this._accent;
  }

  /** Draw a single group on the live layer (for move/paste previews). */
  private previewGroup(ctx: CanvasRenderingContext2D, g: Group): void {
    if (g.type === 'highlight') drawHighlight(ctx, g.bbox, g.color);
    else if (g.type === 'text') drawTextGroup(ctx, g);
    else if (g.stroke) drawStroke(ctx, g.stroke, { color: g.color, size: g.size });
  }

  /** Pass-3 ink: plain pen strokes (other types have their own passes). */
  private renderGroup(ctx: CanvasRenderingContext2D, group: Group): void {
    if (group.type === undefined || group.type === 'stroke') {
      drawStroke(ctx, group.stroke, {
        color: group.color,
        size: group.size,
      });
    }
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

/** Combined bbox of a set of groups (for move preview). */
function unionBBox(groups: Group[]): BBox {
  const pts: { x: number; y: number }[] = [];
  for (const g of groups) {
    pts.push({ x: g.bbox.x, y: g.bbox.y }, { x: g.bbox.x + g.bbox.w, y: g.bbox.y + g.bbox.h });
  }
  return getBoundingBox(pts);
}
