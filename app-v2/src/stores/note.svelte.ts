// ─────────────────────────────────────────────────────────────────────────────
// Note store — current note's content + metadata + dirty flag.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';

// $state.RAW, not deep $state: a note is thousands of strokes × dozens of points,
// and a deep proxy put a trap (plus a lazily-created signal) on every point read —
// rendering, hit-testing and history walked the note ~80× slower than plain
// objects. Every write path reassigns the array (commit/setGroups/…), which is
// what effects subscribe to; UI that shows a group's FIELDS reads `version`.
let _groups = $state.raw<Group[]>([]);
// Reactive twin of _gen — bumped by every write, including in-place edits that
// only call commit()/markDirty(). Popups editing one group key their view on it.
let _version = $state(0);
let _path = $state<string | null>(null);
let _isSummary = $state<boolean>(false);
let _dirty = $state<boolean>(false);
let _idCounter = $state<number>(0);
// Mutation generation (plain, non-reactive): bumped by every write path, so
// history can tell "nothing changed since my last snapshot" in O(1).
let _gen = 0;

export const note = {
  get groups() {
    return _groups;
  },
  get path() {
    return _path;
  },
  get isSummary() {
    return _isSummary;
  },
  get dirty() {
    return _dirty;
  },
  get gen() {
    return _gen;
  },
  get version() {
    return _version;
  },

  set(groups: Group[], path: string, isSummary = false) {
    _gen++;
    _version = _gen;
    _groups = groups;
    _path = path;
    _isSummary = isSummary;
    _dirty = false;
    _idCounter = groups.reduce((m, g) => Math.max(m, g.id), 0);
  },

  /** Close the current note (e.g. after it's deleted) — blank canvas, no path. */
  close() {
    _gen++;
    _version = _gen;
    _groups = [];
    _path = null;
    _isSummary = false;
    _dirty = false;
    _idCounter = 0;
  },

  addGroup(group: Group) {
    _gen++;
    _version = _gen;
    _groups = [..._groups, group];
    _dirty = true;
  },

  removeGroup(id: number) {
    _gen++;
    _version = _gen;
    _groups = _groups.filter((g) => g.id !== id);
    _dirty = true;
  },

  /** Replace the entire group array (ids never go backwards — see restore). */
  setGroups(groups: Group[]) {
    _gen++;
    _version = _gen;
    _groups = groups;
    _dirty = true;
    _idCounter = groups.reduce((m, g) => Math.max(m, g.id), _idCounter);
  },

  /** Replace the group array from history (undo/redo). Unlike setGroups, the id
   *  counter never goes DOWN — an undone group's id must not be handed to a new
   *  stroke, or redoing it would create a duplicate id. */
  restore(groups: Group[]) {
    _gen++;
    _version = _gen;
    _groups = groups;
    _dirty = true;
    _idCounter = groups.reduce((m, g) => Math.max(m, g.id), _idCounter);
  },

  /** Commit in-place mutations made directly on the groups proxy (used by the
   *  classifier, which pushes/splices/recolors many groups in one pass). */
  commit() {
    _gen++;
    _version = _gen;
    _groups = [..._groups];
    _dirty = true;
  },

  markDirty() {
    _gen++;
    _version = _gen;
    _dirty = true;
  },

  markClean() {
    _dirty = false;
  },

  /** Generate the next unique id for a new group within the current note. */
  nextId(): number {
    _idCounter += 1;
    return _idCounter;
  },

  /** For popups that edit ONE group and show its fields: the group with this id,
   *  as a fresh view on every note change. Groups are plain (non-reactive)
   *  objects, so a $derived returning the same object would never update the
   *  template after an in-place edit; a new identity per `version` does. Reads
   *  and writes pass straight through to the real group. */
  view(id: number | null): Group | null {
    void _version; // re-run on every note write
    if (id === null) return null;
    const g = _groups.find((x) => x.id === id);
    return g ? new Proxy(g, {}) : null;
  },

  /** Plain (non-proxy) deep copy of the current groups — for persistence. */
  snapshot(): Group[] {
    return $state.snapshot(_groups) as Group[];
  },
};
