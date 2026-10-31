// ─────────────────────────────────────────────────────────────────────────────
// Autosave manager. Saving must never touch the pen, so the main thread does only
// small, interruptible work; the note itself is written by save.worker.ts:
//   • the worker keeps its own copy of the open note (saveMirror.ts);
//   • between strokes we fingerprint groups in short slices and send only the ones
//     that changed, then ask the worker to write. A pen coming down pauses this
//     within a slice, and a write already running is off-thread so it can't matter;
//   • "saved" is only reported once the worker confirms the write.
//
// If the worker fails it's restarted from the last saved record, and only what
// changed since then is re-sent. The main thread writes a note itself only in
// flushNow() (note switch, app hidden), when nobody is writing. Drives the
// save-status indicator.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { CONFIG } from '$config/constants';
import { note } from '$stores/note.svelte';
import { saveState } from '$stores/save.svelte';
import { saveNote } from './notes';
import { fingerprintGroup } from './fingerprint';
import type { PatchItem, SaveRequest, SaveResponse } from './saveMirror';

/** Longest the main thread works before giving the pen a turn. */
const SLICE_MS = 3;
/** Roughly how many points go in one message to the worker. */
const BATCH_POINTS = 4000;
const PEN_POLL_MS = 60;
/** A pointer with no events for this long lost its pointerup (left the window). */
const PEN_STALE_MS = 15000;
const ACK_TIMEOUT_MS = 30000;
const FLUSH_ACK_TIMEOUT_MS = 5000;
const RETRY_MS = 3000;
const RETRY_MAX_MS = 30000;

interface Mirror {
  session: number;
  opened: Promise<boolean>;
  /** fingerprints of the record as the worker loaded it, by index (first scan) */
  seed: Int32Array | null;
  uids: WeakMap<Group, number>;
  nextUid: number;
  /** what the worker holds: uid → fingerprint */
  sent: Map<number, number>;
}

let _timer: number | null = null;
let _lastActivity = performance.now();
let _dirtySince: number | null = null;
let _running: Promise<boolean> | null = null;
let _paused = 0;
let _force = false; // flushNow: nobody is writing, finish without yielding
let _failures = 0;
const _down = new Set<number>();

let _worker: Worker | null = null;
let _mirror: Mirror | null = null;
let _nextToken = 1;
// outstanding replies from the worker; each resolves false if it dies
const _acks = new Map<number, (ok: boolean) => void>();
const _opens = new Map<number, (fp: Int32Array | null) => void>();

/** Mark recent pointer/input activity so autosave can wait for an idle gap. */
export function noteActivity(): void {
  _lastActivity = performance.now();
}

function penBusy(): boolean {
  return _down.size > 0 && performance.now() - _lastActivity < PEN_STALE_MS;
}

/** Mark the note dirty + schedule an autosave. */
export function markDirty(): void {
  note.markDirty();
  if (!note.path) return;
  saveState.set('dirty');
  _dirtySince ??= performance.now();
  void ensureMirror();
  schedule(CONFIG.AUTOSAVE_DEBOUNCE_MS);
}

/** Run `attempt` in `ms`, or sooner if the changes have waited long enough. */
function schedule(ms: number): void {
  if (_timer !== null) clearTimeout(_timer);
  const age = performance.now() - (_dirtySince ?? performance.now());
  _timer = window.setTimeout(attempt, Math.max(0, Math.min(ms, CONFIG.AUTOSAVE_MAX_WAIT_MS - age)));
}

function attempt(): void {
  _timer = null;
  if (!note.dirty) _dirtySince = null;
  if (!note.dirty || !note.path || _running || _paused > 0) return; // _running reschedules itself
  if (penBusy()) {
    _timer = window.setTimeout(attempt, PEN_POLL_MS);
    return;
  }
  const now = performance.now();
  const idle = now - _lastActivity;
  const overdue = now - (_dirtySince ?? now) >= CONFIG.AUTOSAVE_MAX_WAIT_MS;
  if (idle < CONFIG.AUTOSAVE_IDLE_MS && !overdue) {
    schedule(CONFIG.AUTOSAVE_IDLE_MS - idle + 50);
    return;
  }
  void run();
}

/** One save, then whatever follow-up it calls for. Never runs twice at once. */
function run(): Promise<boolean> {
  _running = save()
    .catch((err) => {
      console.error('[autosave] save failed:', err);
      return false;
    })
    .then((ok) => {
      _running = null;
      if (ok) _failures = 0;
      else if (note.dirty && note.path) {
        saveState.set('error');
        _failures++;
        _dirtySince = performance.now(); // the retry delay below is what counts now
        if (_timer !== null) clearTimeout(_timer);
        const delay = Math.min(RETRY_MS * 2 ** (_failures - 1), RETRY_MAX_MS);
        _timer = window.setTimeout(attempt, delay);
        return ok;
      }
      if (note.dirty && note.path) schedule(CONFIG.AUTOSAVE_DEBOUNCE_MS); // edited during the save
      return ok;
    });
  return _running;
}

async function save(): Promise<boolean> {
  const path = note.path;
  if (!path) return false;
  saveState.set('saving');
  const m = await ensureMirror();
  if (!m || !current(m)) return false;

  const pushed = await pushChanges(m);
  if (!pushed || !current(m)) return false;

  const token = _nextToken++;
  const acked = new Promise<boolean>((resolve) => {
    const timeout = window.setTimeout(
      () => killWorker(),
      _force ? FLUSH_ACK_TIMEOUT_MS : ACK_TIMEOUT_MS,
    );
    _acks.set(token, (ok) => {
      clearTimeout(timeout);
      resolve(ok);
    });
  });
  post(
    { type: 'commit', session: m.session, token, order: pushed.order, isSummary: note.isSummary },
    [pushed.order.buffer],
  );
  if (!(await acked)) return false;
  if (note.session === m.session) landed(pushed.gen);
  return true;
}

/** Still the open note, and the worker still has it. */
function current(m: Mirror): boolean {
  return _mirror === m && note.session === m.session;
}

/** The note as of `gen` is on disk; later edits keep it dirty. */
function landed(gen: number): void {
  if (note.gen !== gen) return void saveState.set('dirty');
  note.markClean();
  _dirtySince = null;
  saveState.set('saved');
}

/** Send every group that differs from the worker's copy. Works in short slices
 *  and steps aside while a pointer is down, so it can't be felt while writing.
 *  Runs over a copy of the array: strokes added meanwhile belong to the next save,
 *  and `gen` is taken first so landed() knows they're still unsaved. */
async function pushChanges(m: Mirror): Promise<{ order: Int32Array; gen: number } | null> {
  const gen = note.gen;
  const groups = note.groups.slice();
  const order = new Int32Array(groups.length);
  const sent = new Map<number, number>();
  const seed = m.seed;
  let batch: PatchItem[] = [];
  let points = 0;
  let sliceStart = performance.now();

  const sendBatch = () => {
    if (batch.length === 0) return;
    postPatch(m.session, batch);
    batch = [];
    points = 0;
  };

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    let uid = m.uids.get(g);
    let held: number | undefined;
    if (uid === undefined) {
      // first scan: the worker's record is in the same order as ours, so index i
      // names the same group. If it doesn't, the fingerprint differs and it's re-sent.
      uid = seed && i < seed.length ? i : m.nextUid++;
      if (seed && i < seed.length) held = seed[i];
      m.uids.set(g, uid);
    } else {
      held = m.sent.get(uid);
    }
    const fp = fingerprintGroup(g);
    order[i] = uid;
    sent.set(uid, fp);
    if (fp !== held) {
      batch.push({ uid, group: g });
      points += g.stroke?.length ?? 1;
      if (points >= BATCH_POINTS) sendBatch();
    }
    if (!_force && (i & 15) === 15 && performance.now() - sliceStart >= SLICE_MS) {
      sendBatch();
      await yieldToPen();
      if (!current(m)) return null;
      sliceStart = performance.now();
    }
  }
  sendBatch();
  m.seed = null;
  m.sent = sent;
  return { order, gen };
}

async function yieldToPen(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  while (penBusy() && !_force) await new Promise((r) => setTimeout(r, PEN_POLL_MS));
}

function postPatch(session: number, items: PatchItem[]): void {
  try {
    post({ type: 'patch', session, items });
  } catch {
    // a group holding a reactive proxy can't be cloned as-is
    post({
      type: 'patch',
      session,
      items: items.map((it) => ({ uid: it.uid, group: note.snapshotGroup(it.group) })),
    });
  }
}

function post(msg: SaveRequest, transfer: Transferable[] = []): void {
  _worker?.postMessage(msg, transfer);
}

// ── worker lifecycle ──────────────────────────────────────────────────────────

function startWorker(): boolean {
  if (_worker) return true;
  try {
    _worker = new Worker(new URL('./save.worker.ts', import.meta.url), { type: 'module' });
  } catch (err) {
    console.error('[autosave] save worker unavailable:', err);
    return false;
  }
  _worker.onmessage = (e: MessageEvent<SaveResponse>) => onWorkerMessage(e.data);
  _worker.onerror = (e) => {
    console.error('[autosave] save worker crashed:', e.message);
    killWorker();
  };
  return true;
}

function onWorkerMessage(res: SaveResponse): void {
  if (res.type === 'opened') {
    _opens.get(res.session)?.(res.fingerprints);
    _opens.delete(res.session);
  } else if (res.type === 'saved') {
    _acks.get(res.token)?.(true);
    _acks.delete(res.token);
  } else {
    // the next save re-opens from the last good record and sends the difference
    console.error('[autosave] save failed:', res.error);
    if (_mirror?.session === res.session) _mirror = null;
    if (res.token !== undefined) {
      _acks.get(res.token)?.(false);
      _acks.delete(res.token);
    } else {
      _opens.get(res.session)?.(null);
      _opens.delete(res.session);
    }
  }
}

function killWorker(): void {
  _worker?.terminate();
  _worker = null;
  _mirror = null;
  for (const done of _acks.values()) done(false);
  _acks.clear();
  for (const done of _opens.values()) done(null);
  _opens.clear();
}

/** The worker's copy of the open note, loaded by the worker itself. */
async function ensureMirror(): Promise<Mirror | null> {
  const path = note.path;
  if (!path) return null;
  const session = note.session;
  if (_mirror?.session !== session) {
    if (!startWorker()) return null;
    const m: Mirror = {
      session,
      seed: null,
      uids: new WeakMap(),
      nextUid: 0,
      sent: new Map(),
      opened: new Promise<Int32Array | null>((resolve) => {
        const timeout = window.setTimeout(killWorker, ACK_TIMEOUT_MS);
        _opens.set(session, (fp) => {
          clearTimeout(timeout);
          resolve(fp);
        });
        post({ type: 'open', session, path });
      }).then((fp) => {
        if (!fp) return false;
        m.seed = fp;
        m.nextUid = fp.length;
        return true;
      }),
    };
    _mirror = m;
  }
  const m = _mirror;
  return (await m.opened) ? m : null;
}

// ── forced saves ──────────────────────────────────────────────────────────────

/** Get the open note onto disk now: note switch, app hidden, page closing. Nobody
 *  is writing at these moments, so if the worker can't do it the main thread does.
 *  Returns true once nothing is left unsaved. */
export async function flushNow(): Promise<boolean> {
  if (!note.path) return false;
  _force = true;
  try {
    if (_running) await _running;
    if (!note.dirty) return true;
    return (await run()) || (await saveOnMainThread());
  } finally {
    _force = false;
  }
}

async function saveOnMainThread(): Promise<boolean> {
  const path = note.path;
  if (!path) return false;
  const gen = note.gen;
  try {
    await saveNote(path, note.snapshot(), { isSummaryNote: note.isSummary });
    _mirror = null; // the record moved on without the worker
    landed(gen);
    return true;
  } catch (err) {
    console.error('[autosave] save failed:', err);
    saveState.set('error');
    return false;
  }
}

/** Hold saves off while `fn` renames or deletes the open note's record, so a write
 *  can't land on the old path afterwards and bring it back. */
export async function withSavesPaused<T>(fn: () => Promise<T>): Promise<T> {
  _paused++;
  try {
    if (_running) await _running;
    return await fn();
  } finally {
    _paused--;
    if (_paused === 0 && note.dirty && note.path) schedule(CONFIG.AUTOSAVE_DEBOUNCE_MS);
  }
}

/** Pointer tracking + beforeunload / visibility safety-net saves. */
export function installLifecycleHooks(): void {
  const opts = { capture: true, passive: true };
  const release = (e: PointerEvent) => _down.delete(e.pointerId);
  window.addEventListener(
    'pointerdown',
    (e) => {
      _down.add(e.pointerId);
      noteActivity();
    },
    opts,
  );
  window.addEventListener('pointerup', release, opts);
  window.addEventListener('pointercancel', release, opts);
  window.addEventListener('blur', () => _down.clear());

  window.addEventListener('beforeunload', () => {
    if (note.dirty && note.path) void flushNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && note.dirty && note.path) void flushNow();
  });
}
