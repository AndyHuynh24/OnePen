// ─────────────────────────────────────────────────────────────────────────────
// History store — transaction-based undo/redo that records per-group DIFFS.
//
// Each undo step is one user action (a pen stroke, a box that recolors the ink it
// encloses, a toolbox tool, a move, an erase …). A transaction snapshots the note
// when the action starts; when it ends we diff against the note and store ONLY the
// groups that changed: `{ id, before, after }`. Undo writes every `before` back
// (removing groups the action added, restoring ones it deleted/recolored/moved);
// redo writes every `after`. So "box → recolor" undoes as ONE step that removes
// the box AND puts each recolored stroke back to its previous color.
//
// Why diffs instead of whole-note snapshots (the previous design):
//   • Strokes classify ASYNC (the gesture model is awaited). A second stroke can
//     finish while the first is still classifying; whole-note snapshots then
//     captured each other's half-applied state and undo removed the wrong ink.
//     Diffs are per-group, and an ending transaction REBASES the others still open
//     (their baseline adopts its result), so concurrent actions never bleed.
//   • The old snapshot cache keyed clones by object identity and assumed groups
//     were never edited in place — but recolor / move / title / reminder all
//     mutate in place, so snapshots went STALE (redo lost colors, undoing a later
//     stroke also reverted an earlier move). Here every cached clone is VALIDATED
//     against the live group (field-by-field; stroke points by array identity +
//     length) before being reused, so in-place edits are always seen.
//
// Two ways to open a transaction:
//   • begin()/commit(tx)/abort(tx) — explicit; used for pen strokes (async).
//   • capture()/dropLast()         — the "implicit" transaction: capture() starts
//     one that stays open until the next capture()/begin()/undo()/redo() closes it.
//     This fits interactive flows whose end isn't a single call (hold → toolbox →
//     color picker previews → …, move-mode drag, text placement). dropLast()
//     cancels it without recording (e.g. toolbox dismissed).
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { note } from './note.svelte';
import { markDirty } from '$persistence/autosave';
import { getEngine } from '$canvas/engineRef';

const MAX_DEPTH = 100;

/** Transient view state that must never become an undo step (tape fade). */
const IGNORED_KEYS = new Set(['revealed', 'fadeProgress']);

// ── validated clone cache ─────────────────────────────────────────────────────
interface Cached {
  ref: Group; // the live group (reactive proxy) this clone was taken from
  strokeRef: unknown; // the live stroke array at clone time
  strokeLen: number;
  keys: string[]; // keys to compare (all but stroke + ignored)
  absent: string[]; // LATE_KEYS the group didn't have yet (must stay undefined)
  clone: Group; // plain copy — shared by history entries, never mutated
}
let _cache = new Map<number, Cached>();

// stroke point arrays are replaced (not edited) when a stroke moves, so one
// plain copy per live array can be shared by every clone that contains it
const _pointCache = new WeakMap<object, Group['stroke']>();

// Fields that tools ADD to an existing group in place (title / reminder tags,
// media crop, math answer, link attachment …). A key the clone doesn't have is
// only checked from this list — enumerating a proxy's keys (ownKeys trap) for
// every group on every stroke was the single biggest cost on dense notes.
const LATE_KEYS = [
  'titleStatus',
  'titleLevel',
  'titleGroupId',
  'reminderStatus',
  'reminderDate',
  'reminderGroupId',
  'crop',
  'text',
  'mathLatex',
  'url',
  'fileData',
  'fileName',
  'fileType',
  'noteText',
  'noteStrokes',
  'color',
  'size',
  'visibility',
  'predictedLabel',
];

/** live (reactive proxy) vs snap (plain). Walks only the PLAIN side's keys and
 *  reads the proxy with plain gets — enumerating a proxy costs a trap per key,
 *  which on a 1000-stroke note was most of the per-stroke history cost. */
function sameValue(live: unknown, snap: unknown): boolean {
  if (live === snap) return true;
  if (typeof live !== 'object' || typeof snap !== 'object' || live === null || snap === null)
    return false;
  if (Array.isArray(snap)) {
    const la = live as unknown[];
    if (!Array.isArray(la) || la.length !== snap.length) return false;
    for (let i = 0; i < snap.length; i++) if (!sameValue(la[i], snap[i])) return false;
    return true;
  }
  const so = snap as Record<string, unknown>;
  const lo = live as Record<string, unknown>;
  const keys = Object.keys(so);
  for (let i = 0; i < keys.length; i++) if (!sameValue(lo[keys[i]], so[keys[i]])) return false;
  return true;
}

/** Plain vs plain, ignoring transient top-level view state. */
function sameClone(a: Group, b: Group): boolean {
  const ao = a as unknown as Record<string, unknown>;
  const bo = b as unknown as Record<string, unknown>;
  const ka = Object.keys(ao).filter((k) => !IGNORED_KEYS.has(k));
  const kb = Object.keys(bo).filter((k) => !IGNORED_KEYS.has(k));
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!(k in bo) || !sameValue(ao[k], bo[k])) return false;
  return true;
}

function isFresh(g: Group, c: Cached): boolean {
  if (c.ref !== g) return false;
  const s = g.stroke;
  if (s !== c.strokeRef || (s?.length ?? -1) !== c.strokeLen) return false;
  const live = g as unknown as Record<string, unknown>;
  const snap = c.clone as unknown as Record<string, unknown>;
  const keys = c.keys;
  for (let i = 0; i < keys.length; i++) if (!sameValue(live[keys[i]], snap[keys[i]])) return false;
  const absent = c.absent;
  for (let i = 0; i < absent.length; i++) if (live[absent[i]] !== undefined) return false;
  return true;
}

function cloneOf(g: Group): Group {
  const c = _cache.get(g.id);
  if (c && isFresh(g, c)) return c.clone;
  const { stroke, ...rest } = g;
  const clone = $state.snapshot(rest) as Group;
  if ('stroke' in g) {
    let pts: Group['stroke'] | undefined = stroke;
    if (stroke) {
      pts = _pointCache.get(stroke);
      if (!pts || pts.length !== stroke.length) {
        pts = $state.snapshot(stroke) as Group['stroke'];
        _pointCache.set(stroke, pts);
      }
    }
    clone.stroke = pts as Group['stroke'];
  }
  remember(g, clone);
  return clone;
}

/** Cache `clone` as the known state of live group `g`. */
function remember(g: Group, clone: Group) {
  const rec = clone as unknown as Record<string, unknown>;
  _cache.set(g.id, {
    ref: g,
    strokeRef: g.stroke,
    strokeLen: g.stroke?.length ?? -1,
    keys: Object.keys(rec).filter((k) => k !== 'stroke' && !IGNORED_KEYS.has(k)),
    absent: LATE_KEYS.filter((k) => rec[k] === undefined),
    clone,
  });
}

interface State {
  map: Map<number, Group>;
  order: number[];
}

// The last full snapshot, reused while the note hasn't been touched since
// (note.gen bumps on every commit / markDirty) — so opening a transaction right
// after the previous one closed costs nothing.
let _last: { gen: number; state: State } | null = null;

function snapshotNote(): State {
  if (_last && _last.gen === note.gen) {
    return { map: new Map(_last.state.map), order: _last.state.order.slice() };
  }
  const map = new Map<number, Group>();
  const order: number[] = [];
  const groups = note.groups;
  for (let i = 0, n = groups.length; i < n; i++) {
    const g = groups[i];
    map.set(g.id, cloneOf(g));
    order.push(g.id);
  }
  _last = { gen: note.gen, state: { map: new Map(map), order: order.slice() } };
  return { map, order };
}

// ── transactions + entries ──────────────────────────────────────────────────────
interface Change {
  id: number;
  before: Group | null;
  after: Group | null;
  /** id of the group directly below it (null = bottom) — for re-insertion order */
  beforePrev: number | null;
  afterPrev: number | null;
  beforeIndex: number;
  afterIndex: number;
}
interface Entry {
  seq: number;
  changes: Change[];
}
export interface Tx {
  readonly seq: number;
  readonly epoch: number;
  readonly auto: boolean;
  base: State;
  done: boolean;
}

let _seq = 0;
let _epoch = 0;
let _past: Entry[] = [];
let _future: Entry[] = [];
const _open = new Set<Tx>();
let _implicit: Tx | null = null;
let _pendingAuto = 0;
let _deferredUndo = 0;
// Stroke transactions that have ended but whose diff hasn't been taken yet. The
// diff needs one pass over the note, so it's taken when the browser is idle (the
// pen is in the air between strokes) instead of right at pen-up — or earlier, the
// moment anything else touches history (every tracked edit calls begin/capture/
// flush first, so the note can't change under a pending entry).
let _closing: Tx[] = [];
let _flushScheduled = false;

// reactive mirrors for the UI (buttons enable/disable, redraw bridges)
let _pastLen = $state(0);
let _futureLen = $state(0);
let _inFlight = $state(false); // an implicit/auto transaction is open (undoable soon)
function sync() {
  _pastLen = _past.length;
  _futureLen = _future.length;
  _inFlight = _implicit !== null || _pendingAuto > 0 || _closing.length > 0;
}

function diff(base: State, cur: State): Change[] {
  const changes: Change[] = [];
  const prevOf = (order: number[]) => {
    const m = new Map<number, { prev: number | null; index: number }>();
    for (let i = 0; i < order.length; i++) m.set(order[i], { prev: i > 0 ? order[i - 1] : null, index: i });
    return m;
  };
  const bp = prevOf(base.order);
  const cp = prevOf(cur.order);
  const ids = new Set<number>([...base.map.keys(), ...cur.map.keys()]);
  for (const id of ids) {
    const before = base.map.get(id) ?? null;
    const after = cur.map.get(id) ?? null;
    if (before === after) continue; // identical cached clone → unchanged
    if (before && after && sameClone(before, after)) continue; // changed and changed back
    changes.push({
      id,
      before,
      after,
      beforePrev: bp.get(id)?.prev ?? null,
      afterPrev: cp.get(id)?.prev ?? null,
      beforeIndex: bp.get(id)?.index ?? -1,
      afterIndex: cp.get(id)?.index ?? -1,
    });
  }
  return changes;
}

/** Other open transactions adopt this one's result as their baseline, so they
 *  don't also record (and later undo) changes that belong to it. */
function rebase(changes: Change[], except: Tx | null) {
  for (const tx of _open) {
    if (tx === except) continue;
    for (const c of changes) {
      if (c.after) {
        if (!tx.base.map.has(c.id)) tx.base.order.push(c.id);
        tx.base.map.set(c.id, c.after);
      } else if (tx.base.map.delete(c.id)) {
        const i = tx.base.order.indexOf(c.id);
        if (i !== -1) tx.base.order.splice(i, 1);
      }
    }
  }
}

function pushEntry(entry: Entry) {
  // keep chronological order by START time: an async stroke that finishes
  // classifying after a later stroke still undoes after it
  let i = _past.length;
  while (i > 0 && _past[i - 1].seq > entry.seq) i--;
  _past.splice(i, 0, entry);
  if (_past.length > MAX_DEPTH) _past.splice(0, _past.length - MAX_DEPTH);
  _future = [];
}

function closeTx(tx: Tx, record: boolean) {
  if (tx.done) return;
  tx.done = true;
  _open.delete(tx);
  if (tx === _implicit) _implicit = null;
  if (tx.auto) _pendingAuto = Math.max(0, _pendingAuto - 1);
  if (tx.epoch !== _epoch) return sync(); // the note was switched meanwhile
  if (record && tx.auto) {
    _closing.push(tx);
    scheduleFlush();
  } else if (record) {
    record_(tx, snapshotNote());
  }
  sync();
  if (tx.auto && _pendingAuto === 0 && _deferredUndo > 0) {
    const n = _deferredUndo;
    _deferredUndo = 0;
    for (let i = 0; i < n; i++) undoNow();
  }
}

function record_(tx: Tx, cur: State) {
  const changes = diff(tx.base, cur);
  if (changes.length > 0) {
    rebase(changes, tx);
    pushEntry({ seq: tx.seq, changes });
  }
}

/** Take the diffs of ended stroke transactions (see _closing). */
function flushClosing() {
  if (_closing.length === 0) return;
  const list = _closing.filter((tx) => tx.epoch === _epoch).sort((a, b) => a.seq - b.seq);
  _closing = [];
  if (list.length > 0) {
    const cur = snapshotNote();
    for (const tx of list) record_(tx, cur);
  }
  sync();
}

function scheduleFlush() {
  if (_flushScheduled) return;
  _flushScheduled = true;
  const run = () => {
    _flushScheduled = false;
    flushClosing();
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 250 });
  else setTimeout(run, 40); // iPad Safari has no requestIdleCallback
}

function commitImplicit() {
  flushClosing();
  if (_implicit) closeTx(_implicit, true);
}

// ── apply listeners (gesture feedback log) ──────────────────────────────────────
/** An undo/redo was applied: `seq` identifies the action (the transaction that
 *  recorded it — pen strokes keep their begin() seq); `removed` / `added` are the
 *  group ids that disappeared / came back. */
export type ApplyListener = (
  dir: 'undo' | 'redo',
  seq: number,
  removed: number[],
  added: number[],
) => void;
const _listeners = new Set<ApplyListener>();

// ── applying an entry ───────────────────────────────────────────────────────────
function apply(entry: Entry, dir: 'undo' | 'redo') {
  const arr = note.groups.slice();
  const target = (c: Change) => (dir === 'undo' ? c.before : c.after);
  const touched = new Map<number, Group>();

  // 1. remove / replace in place (keeps z-order for edits)
  for (const c of entry.changes) {
    const t = target(c);
    const idx = arr.findIndex((g) => g.id === c.id);
    if (!t) {
      if (idx !== -1) arr.splice(idx, 1);
    } else {
      touched.set(c.id, t);
      if (idx !== -1) arr[idx] = structuredClone(t);
    }
  }
  // 2. re-insert missing groups next to the group that was below them, bottom-up
  const inserts = entry.changes
    .filter((c) => target(c) && !arr.some((g) => g.id === c.id))
    .sort((a, b) =>
      dir === 'undo' ? a.beforeIndex - b.beforeIndex : a.afterIndex - b.afterIndex,
    );
  for (const c of inserts) {
    const prev = dir === 'undo' ? c.beforePrev : c.afterPrev;
    const index = dir === 'undo' ? c.beforeIndex : c.afterIndex;
    let at: number;
    if (prev === null) at = 0;
    else {
      const p = arr.findIndex((g) => g.id === prev);
      at = p !== -1 ? p + 1 : Math.min(Math.max(index, 0), arr.length);
    }
    arr.splice(at, 0, structuredClone(target(c) as Group));
  }

  note.restore(arr);

  // the restored live objects are fresh copies of known clones → seed the cache
  // so the next transaction doesn't have to re-clone them
  for (const g of note.groups) {
    const t = touched.get(g.id);
    if (t) remember(g, t);
  }

  markDirty();
  getEngine()?.invalidateDrawFull();
  getEngine()?.invalidateLive();

  if (_listeners.size > 0) {
    const removed: number[] = [];
    const added: number[] = [];
    for (const c of entry.changes) {
      const from = dir === 'undo' ? c.after : c.before;
      const to = target(c);
      if (from && !to) removed.push(c.id);
      else if (!from && to) added.push(c.id);
    }
    for (const l of _listeners) {
      try {
        l(dir, entry.seq, removed, added);
      } catch (err) {
        console.error('[history] listener failed:', err);
      }
    }
  }
}

function undoNow(): boolean {
  commitImplicit();
  const entry = _past.pop();
  if (!entry) {
    sync();
    return false;
  }
  // anything still open started from the pre-undo state → it must not record
  // the undo as its own change
  const undone: Change[] = entry.changes.map((c) => ({ ...c, before: c.after, after: c.before }));
  apply(entry, 'undo');
  rebase(undone, null);
  _future.push(entry);
  sync();
  return true;
}

export const history = {
  get canUndo() {
    return _pastLen > 0 || _inFlight;
  },
  get canRedo() {
    return _futureLen > 0;
  },
  get depth() {
    return _pastLen;
  },

  /** Open an explicit transaction. Closes any implicit one first (a new action
   *  means the previous interactive one is finished). `auto` = it will close by
   *  itself shortly (async stroke classification) — undo waits for it. */
  begin(opts: { auto?: boolean } = {}): Tx {
    commitImplicit();
    const tx: Tx = { seq: ++_seq, epoch: _epoch, auto: !!opts.auto, base: snapshotNote(), done: false };
    _open.add(tx);
    if (tx.auto) _pendingAuto++;
    sync();
    return tx;
  },
  /** Close a transaction, recording what it changed as one undo step. */
  commit(tx: Tx) {
    closeTx(tx, true);
  },
  /** Close a transaction without recording it. */
  abort(tx: Tx) {
    closeTx(tx, false);
  },

  /** Start the implicit transaction (closing the previous one). Returns its
   *  seq — the id an undo/redo of this action reports to apply listeners. */
  capture(): number {
    commitImplicit();
    const tx: Tx = { seq: ++_seq, epoch: _epoch, auto: false, base: snapshotNote(), done: false };
    _open.add(tx);
    _implicit = tx;
    sync();
    return tx.seq;
  },

  /** Observe undo/redo (see ApplyListener). Returns an unsubscribe function. */
  onApply(listener: ApplyListener): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
  /** Cancel the implicit transaction without recording it (no-op if none). */
  dropLast() {
    flushClosing();
    if (_implicit) closeTx(_implicit, false);
  },

  /** Record ended strokes now. Call right before an async continuation edits
   *  the note (stroke classification after the model await), so a stroke that
   *  ended meanwhile isn't credited with those edits. */
  flush() {
    flushClosing();
  },

  /** Undo the most recent action. If a stroke is still being classified, the
   *  undo waits for it (so it removes that stroke, not the one before it). */
  undo(): boolean {
    if (_pendingAuto > 0) {
      _deferredUndo++;
      return true;
    }
    return undoNow();
  },

  /** Re-apply the most recently undone action. */
  redo(): boolean {
    if (_pendingAuto > 0) return false;
    commitImplicit(); // (also records ended strokes)
    const entry = _future.pop();
    if (!entry) {
      sync();
      return false;
    }
    apply(entry, 'redo');
    rebase(entry.changes, null);
    _past.push(entry);
    sync();
    return true;
  },

  /** Forget everything (note switched / closed). */
  clear() {
    _epoch++;
    _past = [];
    _future = [];
    _open.clear();
    _implicit = null;
    _pendingAuto = 0;
    _deferredUndo = 0;
    _closing = [];
    _cache = new Map();
    _last = null;
    sync();
  },
};
