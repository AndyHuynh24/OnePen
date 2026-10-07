// ─────────────────────────────────────────────────────────────────────────────
// Move-mode state — the "move" tool selects a group set and drags it.
//
// The drag accumulates a (dx,dy) OFFSET rather than mutating the real groups, so
// the live preview is drawn shifted while the underlying data stays put. Only
// commit() bakes the offset into the groups; end() (Escape) discards it cleanly.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';

let _active = $state<boolean>(false);
let _selection = $state.raw<Group[]>([]); // live note groups — never proxy
let _dx = $state<number>(0);
let _dy = $state<number>(0);
let _placing = $state<boolean>(false);

export const moveMode = {
  get active() {
    return _active;
  },
  get selection() {
    return _selection;
  },
  get dx() {
    return _dx;
  },
  get dy() {
    return _dy;
  },
  /** true = paste-style placement (persistent box, tap-outside commits) */
  get placing() {
    return _placing;
  },
  begin(selection: Group[], placing = false) {
    _selection = selection;
    _dx = 0;
    _dy = 0;
    _active = true;
    _placing = placing;
  },
  translate(ddx: number, ddy: number) {
    _dx += ddx;
    _dy += ddy;
  },
  /** Bake the accumulated offset into the real groups. */
  commit() {
    for (const g of _selection) {
      g.bbox.x += _dx;
      g.bbox.y += _dy;
      // REPLACE the points array (don't edit points in place) so committed
      // stroke arrays stay immutable — history can then safely share them across
      // snapshots instead of re-cloning every stroke on every save.
      if (g.stroke) {
        g.stroke = g.stroke.map((p) => ({ ...p, x: p.x + _dx, y: p.y + _dy }));
      }
    }
  },
  /** Cancel (or finish) — clears state without applying the offset. */
  end() {
    _active = false;
    _selection = [];
    _dx = 0;
    _dy = 0;
    _placing = false;
  },
};
