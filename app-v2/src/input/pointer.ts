// ─────────────────────────────────────────────────────────────────────────────
// Pointer dispatcher.
//   pen / mouse : draw · hold→toolbox · erase · shift-pan
//   touch       : 1 finger pan (+ momentum) · 2 finger pinch-zoom + tap-to-undo
//   any         : drag a move/paste selection when one is active
//
// Specs (friction, min-velocity, tap thresholds, pinch sensitivity) are ported
// from the original; zoom is anchored to the cursor/pinch-midpoint (a UX
// improvement over the original's origin-anchored zoom) and pan is free 2D with
// momentum rather than axis-locked.
// ─────────────────────────────────────────────────────────────────────────────

import { APP_MODE } from '$config/strokeTypes';
import { CONFIG } from '$config/constants';
import { viewport } from '$stores/viewport.svelte';
import { ui } from '$stores/ui.svelte';
import { history } from '$stores/history.svelte';
import { draw } from '$stores/draw.svelte';
import { note } from '$stores/note.svelte';
import { tools } from '$stores/tools.svelte';
import { toolbox } from '$stores/toolbox.svelte';
import { clipboard } from '$stores/clipboard.svelte';
import { moveMode } from '$stores/move.svelte';
import { scrollSignal } from '$stores/scroll.svelte';
import { editor } from '$stores/editor.svelte';
import { selection } from '$stores/selection.svelte';
import { embed } from '$stores/embed.svelte';
import { tape } from '$stores/tape.svelte';
import { annot } from '$stores/annot.svelte';
import { mathVerify } from '$stores/mathVerify.svelte';
import type { CanvasEngine } from '$canvas/engine';
import { screenToWorld } from '$canvas/transform';
import { intersectBBox, pointInBBox } from '$canvas/hitTest';
import type { Group } from '$types/group';
import { classifyStroke } from '$modifiers/classify';
import { selectToolByIndex, dismissToolbox } from '$tools/execute';
import { isInGestureCooldown, isInPenCooldown, isPalmTouch, notePenActivity, noteGestureActivity } from './palmRejection';
import { markDirty, noteActivity } from '$persistence/autosave';
import { perf } from '$lib/perf';
import { undo as undoAction } from '$lib/undo';
import { gestureFeedback } from '$ml/feedback';

const HOLD_MS = 250;
const STILL_EPSILON = CONFIG.MOVEMENT_THRESHOLD;
const TAP_MAX_MS = 200;
const TAP_MAX_MOVE = 20;
const PASTE_PAD = 8;
// A single-finger touch must travel past this many screen px before it commits
// to panning — below it the gesture is still a "potential tap", so taps on
// answers / sticky notes register reliably instead of being eaten as tiny scrolls.
const PAN_DEADZONE = 10;

type PenMode = 'draw' | 'pan' | 'erase' | 'move' | 'paste' | 'dragMedia' | 'resizeMedia' | null;
type MediaHandle = 'nw' | 'ne' | 'sw' | 'se';

interface TouchInfo {
  x: number;
  y: number;
  sx: number;
  sy: number;
  startTime: number;
}

export function attachPointer(el: HTMLElement, engine: CanvasEngine): { detach: () => void } {
  // ── pen / mouse single-pointer state ──────────────────────────────────────
  let activePointerId: number | null = null;
  let mode: PenMode = null;
  let panLast: { x: number; y: number } | null = null;
  let dragLast: { x: number; y: number } | null = null;

  // hold → toolbox
  let holdTimer: number | null = null;
  let holdAnchor: { x: number; y: number } | null = null;
  let holdFired = false;
  let holdReleased = false;
  let lastScreen = { x: 0, y: 0 };

  // eraser gesture: did the pointer drag past the still-threshold (→ erasing,
  // not a press), and has this erase gesture taken its history snapshot yet?
  let eraseMoved = false;
  let eraseCaptured = false;

  // pointer type of the current/last stroke (pen / mouse / touch) — logged with
  // gesture feedback so recognition quality can be compared per input device
  let lastPointerType = 'pen';

  // Canvas origin on screen, cached and refreshed only when the canvas resizes.
  // Reading it per event (getBoundingClientRect / offsetX) forces a synchronous
  // layout whenever the DOM changed — e.g. right after a stroke commit updated
  // the UI — which delayed the first ink of the next stroke.
  let origin = { left: 0, top: 0 };
  const readOrigin = () => {
    const r = el.getBoundingClientRect();
    origin = { left: r.left, top: r.top };
  };
  readOrigin();
  const originObserver = new ResizeObserver(readOrigin);
  originObserver.observe(el);

  // momentum
  let vel = { x: 0, y: 0 };
  let panVelTime = 0;
  let momentumRAF: number | null = null;

  // ── touch multi-pointer state ─────────────────────────────────────────────
  const touches = new Map<number, TouchInfo>();
  let touchGesture: 'pan' | 'pinch' | null = null;
  let panAxis: 'x' | 'y' | 'free' | null = null; // soft axis-lock for touch pan
  let panCommitted = false; // single-finger pan crossed the deadzone yet?
  let pinchLastDist = 0;
  let pinchLastMid = { x: 0, y: 0 };
  let tapStartTime = 0;
  let tapMoved = false;

  function xy(ev: PointerEvent): { x: number; y: number } {
    return { x: ev.clientX - origin.left, y: ev.clientY - origin.top };
  }

  function world(s: { x: number; y: number }) {
    return screenToWorld(s.x, s.y, viewport.scale, viewport.offset);
  }

  // ── text tap / double-tap (mouse + touch; pen draws through) ──────────────
  let lastTextTapId: number | null = null;
  let lastTextTapTime = 0;
  function textGroupAt(w: { x: number; y: number }): Group | null {
    for (let i = note.groups.length - 1; i >= 0; i--) {
      const g = note.groups[i];
      // only editable text blocks; placed character-strokes behave like ink
      if (g.type === 'text' && !g.isChar && g.visibility !== false && pointInBBox(w.x, w.y, g.bbox))
        return g;
    }
    return null;
  }
  /** Returns true if the tap was consumed by a text block (select / edit). */
  function handleTextTap(g: Group): boolean {
    const now = performance.now();
    if (lastTextTapId === g.id && now - lastTextTapTime < 400) {
      editor.open(g.id); // double-tap → edit
      lastTextTapId = null;
      return true;
    }
    lastTextTapId = g.id;
    lastTextTapTime = now;
    return true; // single tap consumes (so you don't draw while aiming to edit)
  }

  /** Topmost math_result under the point (for the verify popup). */
  function mathResultAt(w: { x: number; y: number }): Group | null {
    for (let i = note.groups.length - 1; i >= 0; i--) {
      const g = note.groups[i];
      if (g.type === 'math_result' && g.visibility !== false && pointInBBox(w.x, w.y, g.bbox))
        return g;
    }
    return null;
  }

  /** Anchored popups (math verify, sticky note, link editor) stay open until you
   *  tap elsewhere — like the sticky note should. Close any whose anchor group the
   *  tap didn't land on. Returns true if a popup was closed (so the tap is
   *  "consumed" as a dismiss and shouldn't also draw). */
  function dismissPopupsOnOutsideTap(w: { x: number; y: number }): boolean {
    let closed = false;
    const hitId = (() => {
      // the group under the tap, if it's a popup anchor
      const mr = mathResultAt(w);
      if (mr) return mr.id;
      const card = mediaGroupAt(w);
      return card ? card.id : null;
    })();

    if (mathVerify.id !== null && hitId !== mathVerify.id) {
      mathVerify.close();
      closed = true;
    }
    if (annot.stickyId !== null && hitId !== annot.stickyId) {
      annot.closeSticky();
      closed = true;
    }
    if (annot.linkEditId !== null && hitId !== annot.linkEditId) {
      annot.closeLink();
      closed = true;
    }
    return closed;
  }

  /** Current move/placement box (selection union shifted by the drag offset). */
  function inMoveBox(w: { x: number; y: number }): boolean {
    const sel = moveMode.selection;
    if (sel.length === 0) return false;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const g of sel) {
      minX = Math.min(minX, g.bbox.x);
      minY = Math.min(minY, g.bbox.y);
      maxX = Math.max(maxX, g.bbox.x + g.bbox.w);
      maxY = Math.max(maxY, g.bbox.y + g.bbox.h);
    }
    return pointInBBox(w.x, w.y, {
      x: minX + moveMode.dx,
      y: minY + moveMode.dy,
      w: maxX - minX,
      h: maxY - minY,
    });
  }

  // ── media: select / drag / resize / long-press-to-edit ────────────────────
  let mediaGroup: Group | null = null;
  let mediaDragGroups: Group[] = [];
  let mediaResizeStart: { x: number; y: number; w: number; h: number; handle: MediaHandle; ar: number } | null = null;
  let mediaStartWorld = { x: 0, y: 0 };
  let mediaMoved = false;
  let mediaTapCandidate: number | null = null;
  // a math answer the current gesture started on (so a pen TAP — not a stroke —
  // opens its verify popup instead of inking a dot on top of it)
  let mathTapCandidate: number | null = null;
  let lastMediaTapId: number | null = null;
  let lastMediaTapTime = 0;

  // Tappable annotations: media (image/PDF) gets the drag/resize card treatment;
  // link/sticky/tape are anchored to their strokes and only respond to taps.
  const isTappable = (g: Group | null): boolean =>
    g?.type === 'media' || g?.type === 'stickynote' || g?.type === 'link' || g?.type === 'tape';

  function mediaGroupAt(w: { x: number; y: number }): Group | null {
    let best: Group | null = null;
    let bestZ = -Infinity;
    for (const g of note.groups) {
      if (!isTappable(g) || g.visibility === false) continue;
      if (!pointInBBox(w.x, w.y, g.bbox)) continue;
      const z = g.zIndex ?? 0;
      if (z >= bestZ) {
        bestZ = z;
        best = g;
      }
    }
    return best;
  }
  function mediaHandleAt(w: { x: number; y: number }): MediaHandle | null {
    const sel = selection.group();
    if (!sel || sel.type !== 'media') return null;
    const b = sel.bbox;
    const hit = (CONFIG.MEDIA.HANDLE_SIZE * 2) / viewport.scale;
    const corners: [MediaHandle, number, number][] = [
      ['nw', b.x, b.y],
      ['ne', b.x + b.w, b.y],
      ['sw', b.x, b.y + b.h],
      ['se', b.x + b.w, b.y + b.h],
    ];
    for (const [name, cx, cy] of corners) {
      if (Math.abs(w.x - cx) <= hit && Math.abs(w.y - cy) <= hit) return name;
    }
    return null;
  }
  function setMediaStroke(g: Group) {
    const b = g.bbox;
    g.stroke = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
    ];
  }
  /** Tap on an annotation. Behavior by type:
   *   - link:   single-tap → open the embed (or the URL editor if none set)
   *   - sticky: single-tap → open the note popup
   *   - media:  double-tap → enter edit mode (drag/resize handles)
   *   - tape:   single-tap → reveal/hide · double-tap → remove
   *  Media + tape need double-tap detection, so their single action waits out a
   *  short window; link + sticky have no double action and fire immediately. */
  let actionTapTimer: number | null = null;
  function handleMediaTap(id: number) {
    const g = note.groups.find((x) => x.id === id) ?? null;
    if (!g) return;

    // link / sticky — single-tap opens immediately
    if (g.type === 'link') {
      if (g.url?.trim() || g.fileData) embed.show(g.id);
      else annot.editLink(g.id);
      engine.invalidateLive();
      return;
    }
    if (g.type === 'stickynote') {
      annot.openSticky(g.id);
      return;
    }

    // media / tape — double-tap detection
    const now = performance.now();
    const isDouble = lastMediaTapId === id && now - lastMediaTapTime < 240;
    if (isDouble) {
      if (actionTapTimer !== null) {
        clearTimeout(actionTapTimer);
        actionTapTimer = null;
      }
      lastMediaTapId = null;
      if (g.type === 'tape') tape.remove(g); // double-tap → remove
      else selection.select(id); // media double-tap → edit mode
      engine.invalidateLive();
      engine.invalidateDraw();
      return;
    }
    lastMediaTapId = id;
    lastMediaTapTime = now;
    if (g.type === 'tape') {
      if (actionTapTimer !== null) clearTimeout(actionTapTimer);
      actionTapTimer = window.setTimeout(() => {
        actionTapTimer = null;
        const cur = note.groups.find((x) => x.id === id);
        if (cur?.type === 'tape') tape.toggleReveal(cur);
      }, 250);
    }
  }

  /** Returns true only when a drag/resize starts — i.e. media is in edit mode.
   *  Otherwise media is locked: records a tap candidate and falls through so the
   *  gesture draws/pans over the media. */
  function handleMediaDown(w: { x: number; y: number }, ev: PointerEvent): boolean {
    mediaTapCandidate = null;
    const sel = selection.group();
    if (sel && sel.type === 'media') {
      const handle = mediaHandleAt(w);
      if (handle) {
        activePointerId = ev.pointerId;
        el.setPointerCapture(ev.pointerId);
        mode = 'resizeMedia';
        mediaGroup = sel;
        mediaDragGroups = [sel];
        mediaResizeStart = {
          x: sel.bbox.x,
          y: sel.bbox.y,
          w: sel.bbox.w,
          h: sel.bbox.h,
          handle,
          ar: sel.bbox.w / sel.bbox.h, // displayed aspect (correct after crop too)
        };
        mediaStartWorld = w;
        mediaMoved = false;
        return true;
      }
      if (pointInBBox(w.x, w.y, sel.bbox)) {
        activePointerId = ev.pointerId;
        el.setPointerCapture(ev.pointerId);
        mode = 'dragMedia';
        mediaGroup = sel;
        // PDF "move all pages": drag every page sharing this document
        mediaDragGroups =
          sel.pdfGroupId && selection.moveAll
            ? note.groups.filter((g) => g.pdfGroupId === sel.pdfGroupId)
            : [sel];
        mediaStartWorld = w;
        mediaMoved = false;
        return true;
      }
      // tapped outside the selected media → exit edit mode, then fall through
      selection.clear();
      engine.invalidateLive();
      return false;
    }
    // locked media → remember it for double-tap detection; don't intercept
    const mg = mediaGroupAt(w);
    if (mg) mediaTapCandidate = mg.id;
    return false;
  }

  function handleMediaMove(w: { x: number; y: number }) {
    if (!mediaGroup) return;
    if (!mediaMoved) {
      if (Math.hypot(w.x - mediaStartWorld.x, w.y - mediaStartWorld.y) < 2 / viewport.scale) return;
      mediaMoved = true;
      history.capture();
    }
    if (mode === 'resizeMedia' && mediaResizeStart) {
      const s = mediaResizeStart;
      const dx = w.x - mediaStartWorld.x;
      const dy = w.y - mediaStartWorld.y;
      const MIN = CONFIG.MEDIA.MIN_SIZE;
      const locked = mediaGroup.aspectLocked;
      let nx = s.x;
      let ny = s.y;
      let nw = s.w;
      let nh = s.h;
      if (s.handle === 'se') {
        nw = Math.max(MIN, s.w + dx);
        nh = locked ? nw / s.ar : Math.max(MIN, s.h + dy);
      } else if (s.handle === 'sw') {
        nw = Math.max(MIN, s.w - dx);
        nx = s.x + (s.w - nw);
        nh = locked ? nw / s.ar : Math.max(MIN, s.h + dy);
      } else if (s.handle === 'ne') {
        nw = Math.max(MIN, s.w + dx);
        nh = locked ? nw / s.ar : Math.max(MIN, s.h - dy);
        ny = s.y + (s.h - nh);
      } else {
        nw = Math.max(MIN, s.w - dx);
        nx = s.x + (s.w - nw);
        nh = locked ? nw / s.ar : Math.max(MIN, s.h - dy);
        ny = s.y + (s.h - nh);
      }
      mediaGroup.bbox = { x: nx, y: ny, w: nw, h: nh };
      setMediaStroke(mediaGroup);
    } else if (mode === 'dragMedia') {
      const dx = w.x - mediaStartWorld.x;
      const dy = w.y - mediaStartWorld.y;
      mediaStartWorld = w;
      for (const mg of mediaDragGroups) {
        mg.bbox.x += dx;
        mg.bbox.y += dy;
        setMediaStroke(mg);
      }
    }
    note.commit();
    engine.invalidateDraw();
    engine.invalidateLive();
  }

  function handleMediaUp() {
    if (mediaMoved) markDirty();
    mediaGroup = null;
    mediaDragGroups = [];
    mediaResizeStart = null;
    mediaMoved = false;
  }

  // ── momentum ───────────────────────────────────────────────────────────────
  function cancelMomentum() {
    if (momentumRAF !== null) {
      cancelAnimationFrame(momentumRAF);
      momentumRAF = null;
    }
  }
  function startMomentum() {
    if (Math.abs(vel.x) < CONFIG.MIN_VELOCITY && Math.abs(vel.y) < CONFIG.MIN_VELOCITY) return;
    cancelMomentum();
    // `vel` is in offset-units per 16ms frame. Decay + displacement are scaled
    // by actual elapsed time so momentum feels identical at 30/60/120Hz.
    let lastT = performance.now();
    const step = () => {
      const now = performance.now();
      const f = Math.min((now - lastT) / 16, 3); // frames elapsed (clamped after stalls)
      lastT = now;
      const decay = Math.pow(CONFIG.FRICTION, f);
      vel.x *= decay;
      vel.y *= decay;
      if (Math.abs(vel.x) < CONFIG.MIN_VELOCITY && Math.abs(vel.y) < CONFIG.MIN_VELOCITY) {
        momentumRAF = null;
        return;
      }
      viewport.pan(vel.x * f, vel.y * f);
      scrollSignal.pingScroll();
      engine.invalidateAll();
      momentumRAF = requestAnimationFrame(step);
    };
    momentumRAF = requestAnimationFrame(step);
  }

  // ── hold → toolbox ──────────────────────────────────────────────────────────
  function clearHold() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }
  function armHold(s: { x: number; y: number }) {
    clearHold();
    holdAnchor = s;
    holdTimer = window.setTimeout(triggerHold, HOLD_MS);
  }
  function removeGroup(id: number | undefined) {
    if (id == null) return;
    const i = note.groups.findIndex((g) => g.id === id);
    if (i !== -1) {
      note.groups.splice(i, 1);
      note.commit();
    }
  }
  function triggerHold() {
    holdTimer = null;
    if (holdFired) return;

    // Eraser press-and-hold opens the quick-tools ("press") toolbox, exactly like
    // a still pen hold does — matching the original app's global hold detector,
    // which fired on every pointerdown regardless of the active tool.
    if (mode === 'erase') {
      holdFired = true;
      holdReleased = false;
      history.capture(); // balances the history.dropLast() in dismiss / tool paths
      draw.setEraserPos(null);
      engine.invalidateLive();
      toolbox.open({ kind: 'press', x: lastScreen.x, y: lastScreen.y, selection: [], modifierId: null });
      return;
    }

    if (mode !== 'draw' || !draw.isDrawing) return;
    holdFired = true;
    holdReleased = false;
    const stroke = [...draw.live];
    const anchor = { ...lastScreen };
    if (stroke.length === 0) {
      holdFired = false;
      return;
    }
    const holdSeq = history.capture();
    const holdPointer = lastPointerType;
    void classifyStroke(stroke, { hold: true }).then((res) => {
      draw.cancel();
      engine.invalidateLive();
      engine.invalidateDraw();
      const kind = res.toolboxIntent;
      if (!kind) {
        history.dropLast();
        return;
      }
      const selection = res.modifiedGroups.filter((g) => g.id !== res.modifier?.id);
      if (kind === 'press' && res.modifier) removeGroup(res.modifier.id);
      if (holdReleased) {
        if (kind !== 'press' && res.modifier) removeGroup(res.modifier.id);
        history.dropLast();
        return;
      }
      gestureFeedback.onStroke({
        seq: holdSeq,
        stroke,
        result: res,
        hold: true,
        pointerType: holdPointer,
        zoom: viewport.scale,
      });
      toolbox.open({
        kind,
        x: anchor.x,
        y: anchor.y,
        selection,
        modifierId: kind === 'press' ? null : (res.modifier?.id ?? null),
      });
    });
  }
  function toolIndexAt(cx: number, cy: number): number | null {
    const hit = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const tool = hit?.closest('[data-tool-index]') as HTMLElement | null;
    return tool ? Number(tool.dataset.toolIndex) : null;
  }

  // ── erase ───────────────────────────────────────────────────────────────────
  function eraseAt(s: { x: number; y: number }) {
    const w = world(s);
    const size = tools.eraserSize;
    const box = { x: w.x - size / 2, y: w.y - size / 2, w: size, h: size };
    draw.setEraserPos(w.x, w.y);
    const erased: number[] = [];
    for (let i = note.groups.length - 1; i >= 0; i--) {
      const g = note.groups[i];
      if (g.visibility === false || !g.bbox) continue;
      if (intersectBBox(g.bbox, box)) {
        erased.push(g.id);
        note.groups.splice(i, 1);
      }
    }
    if (erased.length > 0) {
      note.commit();
      gestureFeedback.noteErased(erased);
    }
    engine.invalidateDraw();
    engine.invalidateLive();
  }

  // ── paste / move helpers ─────────────────────────────────────────────────────
  function pointInPasteBBox(w: { x: number; y: number }): boolean {
    const b = clipboard.pasteBBox;
    if (!b) return false;
    return (
      w.x >= b.x - PASTE_PAD &&
      w.x <= b.x + b.w + PASTE_PAD &&
      w.y >= b.y - PASTE_PAD &&
      w.y <= b.y + b.h + PASTE_PAD
    );
  }
  function finalizePaste() {
    for (const g of clipboard.pastedGroups) note.groups.push(g);
    note.commit();
    clipboard.endPaste();
    markDirty();
    engine.invalidateDraw();
    engine.invalidateLive();
  }
  function commitMove() {
    moveMode.commit(); // bake the offset into the real groups
    moveMode.end();
    note.commit();
    markDirty();
    engine.invalidateDraw();
    engine.invalidateLive();
  }

  // ── draw / pan begins ─────────────────────────────────────────────────────────
  function beginDraw(ev: PointerEvent, pressure: number) {
    activePointerId = ev.pointerId;
    // NOTE: deliberately NO setPointerCapture for drawing. The original app found
    // pointer capture makes some devices swallow every other pen stroke (janky,
    // "laggy" feel). The live canvas is full-screen, so events already land on it
    // without capture; leaving it over an overlay just cancels the stroke (fine).
    mode = 'draw';
    holdFired = false;
    holdReleased = false;
    // Diagnostic: record what kind of pointer this is. `pointerrawupdate` (the
    // low-latency path) is only emitted by Chromium for high-frequency pointers —
    // a 'mouse' or a frame-locked 'touch' digitizer never fires it, while a 'pen'
    // on a supporting device does. The HUD logs this so we can see the real cause.
    (window as unknown as { _ptrType?: string })._ptrType = ev.pointerType;
    lastPointerType = ev.pointerType;
    ui.setMode(APP_MODE.DRAWING);
    const s = xy(ev);
    lastScreen = s;
    const w = world(s);
    draw.begin({ x: w.x, y: w.y, p: pressure, t: ev.timeStamp }, viewport.scale);
    engine.beginLiveStroke();
    armHold(s);
  }
  function beginPan(ev: PointerEvent) {
    cancelMomentum();
    activePointerId = ev.pointerId;
    el.setPointerCapture(ev.pointerId);
    mode = 'pan';
    ui.setMode(APP_MODE.PANNING);
    const s = xy(ev);
    panLast = s;
    vel = { x: 0, y: 0 };
    panVelTime = performance.now();
  }
  function beginErase(ev: PointerEvent) {
    activePointerId = ev.pointerId;
    el.setPointerCapture(ev.pointerId);
    mode = 'erase';
    holdFired = false;
    holdReleased = false;
    eraseMoved = false;
    eraseCaptured = false;
    ui.setMode(APP_MODE.ERASING);
    const s = xy(ev);
    lastScreen = s;
    const w = world(s);
    draw.setEraserPos(w.x, w.y); // show the eraser ring on touch-down
    engine.invalidateLive();
    // Erase happens on drag (or a quick tap on release); a still hold opens the
    // quick-tools toolbox instead — so arm the same hold timer the pen uses.
    armHold(s);
  }
  function beginMove(ev: PointerEvent) {
    activePointerId = ev.pointerId;
    el.setPointerCapture(ev.pointerId);
    mode = 'move';
    dragLast = world(xy(ev));
  }
  function beginPasteDrag(ev: PointerEvent) {
    activePointerId = ev.pointerId;
    el.setPointerCapture(ev.pointerId);
    mode = 'paste';
    dragLast = world(xy(ev));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  function onDown(ev: PointerEvent) {
    noteActivity();
    cancelMomentum();
    mediaTapCandidate = null;
    mathTapCandidate = null;
    if (toolbox.isOpen && ev.pointerType !== 'touch') {
      // pen/mouse: handled by the held pointer; ignore stray downs
      if (activePointerId !== null) return;
    }

    // touch is handled by the multi-touch path
    if (ev.pointerType === 'touch') {
      onTouchDown(ev);
      return;
    }
    if (activePointerId !== null) return;

    const s = xy(ev);
    const w = world(s);

    // a tap outside an open popup (math verify / sticky / link) closes it
    dismissPopupsOnOutsideTap(w);

    // paste / move take priority over drawing
    if (clipboard.pasting) {
      if (pointInPasteBBox(w)) beginPasteDrag(ev);
      else finalizePaste();
      ev.preventDefault();
      return;
    }
    if (moveMode.active) {
      if (moveMode.placing && !inMoveBox(w)) commitMove(); // tap outside → place
      else beginMove(ev);
      ev.preventDefault();
      return;
    }

    if (ev.pointerType === 'pen') {
      notePenActivity();
      if (tools.eraserActive) {
        beginErase(ev);
      } else {
        // remember if this pen-down landed on a math answer — a tiny tap (no real
        // stroke) opens its verify popup on pen-up instead of inking a dot.
        const mr = mathResultAt(w);
        if (mr) mathTapCandidate = mr.id;
        beginDraw(ev, ev.pressure || 0.5);
      }
      ev.preventDefault();
      return;
    }
    // mouse — text / media interactions take priority over drawing
    if (!ev.shiftKey && !tools.eraserActive) {
      const mr = mathResultAt(w);
      if (mr) {
        mathVerify.pin(mr.id); // tap a math answer → pin the verify popup (no timer)
        ev.preventDefault();
        return;
      }
      const tg = textGroupAt(w);
      if (tg) {
        handleTextTap(tg);
        ev.preventDefault();
        return;
      }
      if (handleMediaDown(w, ev)) {
        ev.preventDefault();
        return;
      }
    }
    if (ev.shiftKey) beginPan(ev);
    else if (tools.eraserActive) beginErase(ev);
    else beginDraw(ev, 0.5);
    ev.preventDefault();
  }

  function onMove(ev: PointerEvent) {
    noteActivity();
    if (ev.pointerType === 'touch') {
      onTouchMove(ev);
      return;
    }
    if (ev.pointerId !== activePointerId) return;
    const s = xy(ev);
    lastScreen = s;

    if (mode === 'dragMedia' || mode === 'resizeMedia') {
      handleMediaMove(world(s));
      return;
    }

    if (mode === 'draw') {
      if (holdFired) {
        toolbox.setHovered(toolIndexAt(ev.clientX, ev.clientY));
        return;
      }
      if (holdAnchor && Math.hypot(s.x - holdAnchor.x, s.y - holdAnchor.y) > STILL_EPSILON) armHold(s);
      // Append every coalesced sample the browser batched (full pen density). The
      // draw store smooths each one on the way in; the engine paints the stroke
      // once on the next frame.
      const _t0 = performance.now();
      const coalesced =
        typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
      const src = coalesced.length > 0 ? coalesced : [ev];
      const r = origin;
      const sc = viewport.scale;
      const off = viewport.offset;
      for (let i = 0; i < src.length; i++) {
        const ce = src[i];
        draw.append({
          x: (ce.clientX - r.left) / sc + off.x,
          y: (ce.clientY - r.top) / sc + off.y,
          p: ce.pressure || 0.5,
          t: ce.timeStamp,
        });
      }
      engine.requestLiveStroke();
      perf.record(performance.now() - _t0, src.length);
      return;
    }
    if (mode === 'erase') {
      if (holdFired) {
        toolbox.setHovered(toolIndexAt(ev.clientX, ev.clientY));
        return;
      }
      // any real movement = erasing intent → cancel the press and start erasing
      if (holdAnchor && Math.hypot(s.x - holdAnchor.x, s.y - holdAnchor.y) > STILL_EPSILON) {
        clearHold();
        eraseMoved = true;
      }
      if (eraseMoved) {
        if (!eraseCaptured) {
          history.capture();
          eraseCaptured = true;
        }
        eraseAt(s);
      } else {
        const w = world(s);
        draw.setEraserPos(w.x, w.y); // keep the ring under the pointer until it moves
        engine.invalidateLive();
      }
      return;
    }
    if (mode === 'move' && dragLast) {
      const w = world(s);
      moveMode.translate(w.x - dragLast.x, w.y - dragLast.y);
      dragLast = w;
      engine.invalidateLive();
      return;
    }
    if (mode === 'paste' && dragLast) {
      const w = world(s);
      clipboard.translatePaste(w.x - dragLast.x, w.y - dragLast.y);
      dragLast = w;
      engine.invalidateLive();
      return;
    }
    if (mode === 'pan' && panLast) {
      const dxOff = -(s.x - panLast.x) / viewport.scale;
      const dyOff = -(s.y - panLast.y) / viewport.scale;
      viewport.pan(dxOff, dyOff);
      const now = performance.now();
      const dt = now - panVelTime;
      if (dt > 0) {
        vel = { x: dxOff / dt * 16, y: dyOff / dt * 16 };
        panVelTime = now;
      }
      panLast = s;
      scrollSignal.pingScroll();
      engine.invalidateAll();
    }
  }

  function onUp(ev: PointerEvent) {
    if (ev.pointerType === 'touch') {
      onTouchUp(ev);
      return;
    }
    if (ev.pointerId !== activePointerId) return;
    clearHold();

    if (mode === 'dragMedia' || mode === 'resizeMedia') {
      handleMediaUp();
    } else if (mode === 'draw' && !holdFired) {
      // a tiny tap (no real stroke) on a math answer → open its verify popup
      if (mathTapCandidate !== null && draw.live.length <= 2) {
        draw.cancel();
        engine.invalidateLive();
        mathVerify.pin(mathTapCandidate);
        engine.invalidateDraw();
      } else if (mediaTapCandidate !== null && draw.live.length <= 2) {
        // a tap on locked media (no real stroke) → double-tap-to-edit, not ink
        draw.cancel();
        engine.invalidateLive();
        handleMediaTap(mediaTapCandidate);
      } else {
        // The pen-up event carries the final position; some platforms (iPad
        // Safari especially) don't send a last pointermove there, so without this
        // the ink stops a little short of where the pen actually lifted.
        appendFinalSample(ev);
        finishStroke();
      }
    } else if (mode === 'draw' && holdFired) {
      if (toolbox.isOpen) {
        const idx = toolIndexAt(ev.clientX, ev.clientY);
        if (idx !== null) selectToolByIndex(idx);
        else dismissToolbox();
      } else {
        holdReleased = true;
      }
    } else if (mode === 'erase') {
      if (holdFired) {
        // releasing over the open press toolbox selects the hovered tool
        if (toolbox.isOpen) {
          const idx = toolIndexAt(ev.clientX, ev.clientY);
          if (idx !== null) selectToolByIndex(idx);
          else dismissToolbox();
        } else {
          holdReleased = true;
        }
      } else {
        if (!eraseMoved) {
          // a quick tap (no drag, no hold) erases whatever is under the point
          history.capture();
          eraseAt(xy(ev));
        }
        draw.setEraserPos(null);
        markDirty();
      }
    } else if (mode === 'move') {
      if (moveMode.placing) engine.invalidateLive(); // keep the box; tap outside commits
      else commitMove();
    } else if (mode === 'paste') {
      // releasing a paste-drag just ends the drag — the move box stays so the
      // user can re-adjust; the paste commits only on a tap OUTSIDE the box
      engine.invalidateLive();
    } else if (mode === 'pan') {
      startMomentum();
    }

    endPointer(ev);
  }

  function appendFinalSample(ev: PointerEvent) {
    const lv = draw.live;
    if (lv.length === 0) return;
    const r = origin;
    const wx = (ev.clientX - r.left) / viewport.scale + viewport.offset.x;
    const wy = (ev.clientY - r.top) / viewport.scale + viewport.offset.y;
    draw.append({ x: wx, y: wy, p: lv[lv.length - 1].p, t: ev.timeStamp });
  }

  function finishStroke() {
    const stroke = draw.end();
    if (stroke.length === 0) {
      engine.invalidateLive(); // nothing to commit — just clear any wet dot
      return;
    }
    const _h0 = performance.now();
    // One undo step per stroke, INCLUDING whatever the stroke does as a gesture
    // (box → recolors the enclosed ink, delete → removes it). Classification is
    // async, so this is an explicit transaction closed when it lands — a stroke
    // drawn meanwhile gets its own, independent step.
    const tx = history.begin({ auto: true });
    const strokePointer = lastPointerType;
    const strokeZoom = viewport.scale;
    const _captureMs = performance.now() - _h0;
    // Keep the just-drawn ink on the live layer until the committed stroke is
    // painted on the draw layer, THEN clear it. classifyStroke can be async (it
    // runs the model for gesture-sized strokes), so clearing live up-front made
    // the stroke vanish for a frame or two before the commit landed — that's the
    // pen-up flash. Clearing in .finally hands off with no visible gap.
    const _cl0 = performance.now();
    void classifyStroke(stroke)
      .then((res) => {
        markDirty();
        engine.invalidateDraw();
        gestureFeedback.onStroke({
          seq: tx.seq,
          stroke,
          result: res,
          hold: false,
          pointerType: strokePointer,
          zoom: strokeZoom,
        });
      })
      .finally(() => {
        history.commit(tx);
        engine.invalidateLive();
      });
    // classifyStroke is async, but its gesture geometry runs synchronously before
    // the first await — so this captures that blocking cost (separate from capture).
    perf.recordCommit(_captureMs, performance.now() - _cl0);
  }

  function endPointer(ev: PointerEvent) {
    activePointerId = null;
    mode = null;
    panLast = null;
    dragLast = null;
    holdAnchor = null;
    holdFired = false;
    ui.setMode(APP_MODE.IDLE);
    try {
      el.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
  }

  function onCancel(ev: PointerEvent) {
    if ((mode === 'dragMedia' || mode === 'resizeMedia') && ev.pointerId === activePointerId) {
      handleMediaUp();
      activePointerId = null;
      mode = null;
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      return;
    }
    if (ev.pointerType === 'touch') {
      touches.delete(ev.pointerId);
      if (touches.size < 2) touchGesture = touches.size === 1 ? 'pan' : null;
      return;
    }
    if (ev.pointerId !== activePointerId) return;
    clearHold();
    if (mode === 'draw' && !holdFired) draw.cancel();
    if (mode === 'draw' && holdFired) {
      holdReleased = true;
      if (toolbox.isOpen) dismissToolbox();
    }
    if (mode === 'erase') {
      draw.setEraserPos(null);
      if (holdFired && toolbox.isOpen) dismissToolbox();
    }
    endPointer(ev);
    engine.invalidateLive();
  }

  // ── touch (multi-pointer) ────────────────────────────────────────────────────
  function onTouchDown(ev: PointerEvent) {
    if (isPalmTouch(ev) || isInPenCooldown()) return;
    cancelMomentum();
    mediaTapCandidate = null;
    mathTapCandidate = null;
    const s = xy(ev);
    touches.set(ev.pointerId, { x: s.x, y: s.y, sx: s.x, sy: s.y, startTime: performance.now() });

    // a tap outside an open popup (math verify / sticky / link) closes it
    dismissPopupsOnOutsideTap(world(s));

    // paste / move with a single finger
    if (touches.size === 1 && (clipboard.pasting || moveMode.active)) {
      // handled like mouse: reuse the single-pointer drag paths
      const w = world(s);
      if (clipboard.pasting) {
        if (pointInPasteBBox(w)) {
          activePointerId = ev.pointerId;
          mode = 'paste';
          dragLast = w;
        } else {
          finalizePaste();
        }
      } else if (moveMode.active) {
        if (moveMode.placing && !inMoveBox(w)) {
          commitMove();
        } else {
          activePointerId = ev.pointerId;
          mode = 'move';
          dragLast = w;
        }
      }
      ev.preventDefault();
      return;
    }

    if (touches.size === 1) {
      // a tap on a math answer pins its verify popup (stays until tap-outside)
      const mr = mathResultAt(world(s));
      if (mr) {
        touches.delete(ev.pointerId);
        mathVerify.pin(mr.id);
        ev.preventDefault();
        return;
      }
      // a tap on a text block selects / double-tap edits (instead of panning)
      const tg = textGroupAt(world(s));
      if (tg) {
        touches.delete(ev.pointerId);
        handleTextTap(tg);
        ev.preventDefault();
        return;
      }
      // media select / drag / resize / long-press
      if (handleMediaDown(world(s), ev)) {
        touches.delete(ev.pointerId);
        ev.preventDefault();
        return;
      }
      if (isInGestureCooldown()) return;
      touchGesture = 'pan';
      panAxis = null;
      panCommitted = false;
      panLast = s;
      vel = { x: 0, y: 0 };
      panVelTime = performance.now();
    } else if (touches.size === 2) {
      // upgrade to pinch — cancel any single-finger pan + pending media tap
      touchGesture = 'pinch';
      mediaTapCandidate = null;
      mode = null;
      panLast = null;
      const [a, b] = [...touches.values()];
      pinchLastDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchLastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      tapStartTime = performance.now();
      tapMoved = false;
    } else {
      // 3+ fingers invalidate the tap
      tapStartTime = 0;
    }
    ev.preventDefault();
  }

  function onTouchMove(ev: PointerEvent) {
    if ((mode === 'dragMedia' || mode === 'resizeMedia') && ev.pointerId === activePointerId) {
      handleMediaMove(world(xy(ev)));
      ev.preventDefault();
      return;
    }
    const t = touches.get(ev.pointerId);
    if (!t) return;
    const s = xy(ev);
    t.x = s.x;
    t.y = s.y;

    // active single-finger drag of a move/paste selection
    if (mode === 'move' && dragLast) {
      const w = world(s);
      moveMode.translate(w.x - dragLast.x, w.y - dragLast.y);
      dragLast = w;
      engine.invalidateLive();
      return;
    }
    if (mode === 'paste' && dragLast) {
      const w = world(s);
      clipboard.translatePaste(w.x - dragLast.x, w.y - dragLast.y);
      dragLast = w;
      engine.invalidateLive();
      return;
    }

    if (touchGesture === 'pinch' && touches.size >= 2) {
      // tap-movement invalidation
      if (Math.abs(s.x - t.sx) > TAP_MAX_MOVE || Math.abs(s.y - t.sy) > TAP_MAX_MOVE) tapMoved = true;

      const [a, b] = [...touches.values()];
      const nd = Math.hypot(a.x - b.x, a.y - b.y);
      const nm = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchLastDist > 0) {
        const factor = nd / pinchLastDist;
        const oldScale = viewport.scale;
        const newScale = Math.max(CONFIG.MIN_SCALE, Math.min(CONFIG.MAX_SCALE, oldScale * factor));
        // anchor the world point under the previous midpoint to the new midpoint
        const wMid = screenToWorld(pinchLastMid.x, pinchLastMid.y, oldScale, viewport.offset);
        viewport.setScale(newScale);
        viewport.setOffset({ x: wMid.x - nm.x / newScale, y: wMid.y - nm.y / newScale });
        scrollSignal.pingZoom();
        scrollSignal.pingScroll();
        engine.zoomGesture();
      }
      pinchLastDist = nd;
      pinchLastMid = nm;
      ev.preventDefault();
      return;
    }

    if (touchGesture === 'pan' && panLast && touches.size === 1) {
      // DEADZONE: stay a "potential tap" until the finger travels past the
      // threshold. Below it, don't scroll at all (so taps aren't eaten).
      if (!panCommitted) {
        if (Math.hypot(s.x - t.sx, s.y - t.sy) < PAN_DEADZONE) {
          ev.preventDefault();
          return;
        }
        panCommitted = true;
        panLast = s; // re-anchor at the crossing point → no jump
      }

      // Soft axis-lock: if the gesture is within ~20° of a pure horizontal or
      // vertical swipe, lock to that axis so a tiny drift doesn't side-scroll.
      // Clearly diagonal swipes stay free. Decided once per gesture.
      if (panAxis === null) {
        const tdx = Math.abs(s.x - t.sx);
        const tdy = Math.abs(s.y - t.sy);
        if (Math.hypot(tdx, tdy) > 10) {
          const major = Math.max(tdx, tdy);
          const minor = Math.min(tdx, tdy);
          if (major > 0 && minor / major < 0.36) panAxis = tdx > tdy ? 'x' : 'y';
          else panAxis = 'free';
        }
      }
      let dxOff = -(s.x - panLast.x) / viewport.scale;
      let dyOff = -(s.y - panLast.y) / viewport.scale;
      if (panAxis === 'x') dyOff = 0;
      else if (panAxis === 'y') dxOff = 0;
      viewport.pan(dxOff, dyOff);
      const now = performance.now();
      const dt = now - panVelTime;
      if (dt > 0) {
        vel = { x: dxOff / dt * 16, y: dyOff / dt * 16 };
        panVelTime = now;
      }
      panLast = s;
      scrollSignal.pingScroll();
      engine.invalidateAll();
      ev.preventDefault();
    }
  }

  function onTouchUp(ev: PointerEvent) {
    if ((mode === 'dragMedia' || mode === 'resizeMedia') && ev.pointerId === activePointerId) {
      handleMediaUp();
      activePointerId = null;
      mode = null;
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      return;
    }
    const tInfo = touches.get(ev.pointerId);
    const tapMovement = tInfo ? Math.hypot(tInfo.x - tInfo.sx, tInfo.y - tInfo.sy) : Infinity;
    const had = !!tInfo;
    touches.delete(ev.pointerId);
    if (!had) return;

    // finishing a move/paste drag
    if (mode === 'move' && activePointerId === ev.pointerId) {
      if (moveMode.placing) engine.invalidateLive(); // keep box; tap outside commits
      else commitMove();
      activePointerId = null;
      mode = null;
      dragLast = null;
      return;
    }
    if (mode === 'paste' && activePointerId === ev.pointerId) {
      // end the drag but stay in paste mode (commit on tap outside the box)
      activePointerId = null;
      mode = null;
      dragLast = null;
      engine.invalidateLive();
      return;
    }

    if (touchGesture === 'pinch') {
      engine.endZoomGesture(); // fingers lifting → render sharp at the new zoom
      // 2-finger tap → undo (quick, no movement)
      if (touches.size === 0) {
        const dur = performance.now() - tapStartTime;
        if (tapStartTime > 0 && dur < TAP_MAX_MS && !tapMoved) {
          if (undoAction()) engine.invalidateAll();
        }
        noteGestureActivity();
        touchGesture = null;
        tapStartTime = 0;
      } else if (touches.size === 1) {
        // dropped to one finger → resume panning with it
        noteGestureActivity();
        const [only] = [...touches.values()];
        only.sx = only.x;
        only.sy = only.y;
        touchGesture = 'pan';
        panAxis = null;
        panCommitted = true; // already mid-gesture after a pinch — no deadzone
        panLast = { x: only.x, y: only.y };
        vel = { x: 0, y: 0 };
        panVelTime = performance.now();
        tapStartTime = 0;
      }
      return;
    }

    if (touchGesture === 'pan' && touches.size === 0) {
      touchGesture = null;
      // a genuinely stationary tap on locked media → double-tap-to-edit; any
      // real scroll movement (>6px) is treated as a pan, never a media tap
      if (mediaTapCandidate !== null && tapMovement < 6) handleMediaTap(mediaTapCandidate);
      else startMomentum();
    }
  }

  // Use the LOWEST-latency move event the platform offers. Chromium fires
  // `pointerrawupdate` BEFORE the frame (sub-frame latency, ~120-240Hz dense
  // samples) — that's what makes ink track the pen. Safari/Firefox don't fire it.
  // Feature-detecting via `'onpointerrawupdate' in window` is unreliable (it
  // reports false on Chromium versions that fully support the event), which left
  // us frame-locked on `pointermove`. So we register BOTH and let the first real
  // `pointerrawupdate` take ownership of movement — raw on Chromium, automatic
  // fallback to `pointermove` elsewhere, never both at once.
  let rawActive = false;
  const onRaw = (e: PointerEvent) => {
    if (!rawActive) {
      rawActive = true;
      (window as unknown as { _rawPointer?: boolean })._rawPointer = true;
    }
    onMove(e);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (rawActive) return; // the raw path owns movement once it has fired
    onMove(e);
  };

  // Platform guards so the pen always draws:
  //  • Windows Ink / Android: a still pen or finger press raises the context menu
  //    (right-click) — it would steal the hold-for-toolbox gesture.
  //  • iPad Safari: an Apple Pencil touch can trigger text-selection / the
  //    magnifier loupe / Scribble, which cancels the pointer stream mid-stroke.
  //    Cancelling the STYLUS touchstart stops that (fingers keep their defaults;
  //    pointer events still fire either way).
  const onContextMenu = (e: Event) => e.preventDefault();
  const onTouchStartGuard = (e: TouchEvent) => {
    const t = e.touches[0] as (Touch & { touchType?: string }) | undefined;
    if (t?.touchType === 'stylus') e.preventDefault();
  };
  el.addEventListener('contextmenu', onContextMenu);
  el.addEventListener('touchstart', onTouchStartGuard, { passive: false });

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerrawupdate', onRaw as EventListener);
  el.addEventListener('pointermove', onPointerMove as EventListener);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onCancel);

  return {
    detach() {
      clearHold();
      cancelMomentum();
      originObserver.disconnect();
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('touchstart', onTouchStartGuard);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerrawupdate', onRaw as EventListener);
      el.removeEventListener('pointermove', onPointerMove as EventListener);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onCancel);
    },
  };
}
