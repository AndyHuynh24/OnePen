// ─────────────────────────────────────────────────────────────────────────────
// Gesture feedback tracker — watches what happens after each prediction (undo /
// redo / erase / toolbox choice / redraw), resolves a best-guess true label with
// the rules in ./rules.ts, and logs everything to the local event store.
//
// Every stroke that reaches the model becomes a GestureEvent, keyed to its undo
// step (history seq). Every finished stroke — model or not — also goes into a
// short "recent strokes" ring so a redraw after an undo can be recognized.
// Raw signals are logged alongside the resolution, so the rules can be re-run
// offline on exported logs.
// ─────────────────────────────────────────────────────────────────────────────

import type { Point } from '$types/geometry';
import type { ClassifyResult } from '$modifiers/classify';
import { history } from '$stores/history.svelte';
import { shapeOf, type StrokeShape } from './similarity';
import { resolveGesture, WINDOWS, type LaterStroke, type Signal } from './rules';
import { eventStore, type GestureEvent } from './eventStore';

const ENABLED_KEY = 'onepen.gestureLog';
const RING_MS = 90_000;

interface Tracked {
  event: GestureEvent;
  seq: number;
  modifierId: number | null;
  shape: StrokeShape;
  timer: ReturnType<typeof setTimeout> | null;
}

interface RingStroke extends LaterStroke {
  seq: number;
  modifierId: number | null;
}

const _tracked = new Map<string, Tracked>();
const _bySeq = new Map<number, string>();
let _ring: RingStroke[] = [];
let _activeHold: { eventId: string | null; ring: RingStroke } | null = null;
let _unsub: (() => void) | null = null;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}
let _enabled = readEnabled();

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function compactPoints(stroke: Point[]): GestureEvent['points'] {
  const t0 = stroke[0]?.t ?? 0;
  return stroke.map((p) => ({
    x: r2(p.x),
    y: r2(p.y),
    t: Math.round((p.t ?? t0) - t0),
    p: r2(p.p ?? 0.5),
  }));
}

function pruneRing(now: number) {
  _ring = _ring.filter((s) => now - s.ts <= RING_MS);
}

function addSignal(t: Tracked, s: Signal) {
  t.event.signals.push(s);
  void eventStore.put(t.event);
}

function finalize(eventId: string) {
  const t = _tracked.get(eventId);
  if (!t) return;
  if (t.timer) clearTimeout(t.timer);
  _tracked.delete(eventId);
  _bySeq.delete(t.seq);
  t.event.resolution = resolveGesture(
    { ts: t.event.ts, hold: t.event.hold, predicted: t.event.predicted, shape: t.shape, signals: t.event.signals },
    _ring,
  );
  t.event.status = 'final';
  void eventStore.put(t.event);
}

function onHistoryApply(dir: 'undo' | 'redo', seq: number) {
  const now = Date.now();
  for (const s of _ring) if (s.seq === seq) s.reverted = dir === 'undo';
  const id = _bySeq.get(seq);
  const t = id ? _tracked.get(id) : undefined;
  if (t) addSignal(t, { kind: dir === 'undo' ? 'undone' : 'redone', ts: now });
}

export const gestureFeedback = {
  get enabled() {
    return _enabled;
  },
  setEnabled(on: boolean) {
    _enabled = on;
    try {
      localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
    } catch {
      /* private mode — keep the in-memory value */
    }
  },

  /** Start listening to undo/redo. Idempotent. */
  init() {
    if (_unsub) return;
    _unsub = history.onApply(onHistoryApply);
  },

  /** A stroke finished classifying (pen-up, or a hold's classification).
   *  `seq` = the history transaction it belongs to. */
  onStroke(opts: {
    seq: number;
    stroke: Point[];
    result: ClassifyResult;
    hold: boolean;
    pointerType: string;
    zoom: number;
  }) {
    if (!_enabled || opts.stroke.length === 0) return;
    const now = Date.now();
    pruneRing(now);
    const { result } = opts;
    const shape = shapeOf(opts.stroke);
    const modifierId = result.modifier?.id ?? null;
    const ring: RingStroke = {
      ts: now,
      shape,
      hold: opts.hold,
      label: result.prediction?.predictedLabel ?? 'none',
      toolboxSelected: null,
      reverted: false,
      seq: opts.seq,
      modifierId,
    };
    _ring.push(ring);

    const pred = result.prediction;
    if (!pred) {
      if (opts.hold) _activeHold = { eventId: null, ring };
      return; // never reached the model → only useful as a possible redraw
    }

    const event: GestureEvent = {
      schemaVersion: 1,
      eventId: uuid(),
      ts: now,
      status: 'pending',
      modelVersion: pred.modelVersion,
      hold: opts.hold,
      predicted: pred.predictedLabel,
      confidence: r2(pred.confidence),
      decision: pred.decision,
      probs: pred.probabilities.map((v) => Math.round(v * 10000) / 10000),
      features: pred.features.map((v) => Math.round(v * 10000) / 10000),
      points: compactPoints(opts.stroke),
      context: {
        enclosedCount: result.context.enclosedCount,
        intersectCount: result.context.intersectCount,
        zoom: r2(opts.zoom),
        bboxW: r2(shape.bbox.w),
        bboxH: r2(shape.bbox.h),
      },
      device: { pointerType: opts.pointerType },
      signals: [],
      resolution: null,
    };
    const t: Tracked = { event, seq: opts.seq, modifierId, shape, timer: null };
    t.timer = setTimeout(() => finalize(event.eventId), WINDOWS.FINALIZE_MS);
    _tracked.set(event.eventId, t);
    _bySeq.set(opts.seq, event.eventId);
    if (opts.hold) _activeHold = { eventId: event.eventId, ring };
    void eventStore.put(event);
  },

  /** The eraser removed these group ids. */
  noteErased(ids: number[]) {
    if (!_enabled || ids.length === 0) return;
    const now = Date.now();
    const set = new Set(ids);
    for (const s of _ring) if (s.modifierId !== null && set.has(s.modifierId)) s.reverted = true;
    for (const t of _tracked.values()) {
      if (t.modifierId !== null && set.has(t.modifierId) && !t.event.signals.some((s) => s.kind === 'erased'))
        addSignal(t, { kind: 'erased', ts: now });
    }
  },

  /** The hold toolbox was resolved: a tool picked, or dismissed. */
  noteToolbox(kind: 'selected' | 'dismissed', toolbox: string, tool = '') {
    const hold = _activeHold;
    _activeHold = null;
    if (!_enabled || !hold) return;
    const now = Date.now();
    if (kind === 'selected') hold.ring.toolboxSelected = toolbox;
    const t = hold.eventId ? _tracked.get(hold.eventId) : undefined;
    if (!t) return;
    addSignal(
      t,
      kind === 'selected'
        ? { kind: 'toolboxSelected', ts: now, toolbox, tool }
        : { kind: 'toolboxDismissed', ts: now, toolbox },
    );
  },

  /** Resolve everything still pending now (e.g. before exporting). */
  flushAll() {
    for (const id of [..._tracked.keys()]) finalize(id);
  },
};
