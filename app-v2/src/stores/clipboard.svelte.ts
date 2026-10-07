// ─────────────────────────────────────────────────────────────────────────────
// Clipboard + paste-mode state. Copy stows a deep clone of the selected groups;
// paste enters a preview mode where the pasted groups follow the pointer until
// committed.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';

let _clipboard = $state.raw<Group[]>([]);
let _pasting = $state<boolean>(false);
let _pastedGroups = $state.raw<Group[]>([]); // live note groups — never proxy
let _pasteBBox = $state<BBox | null>(null);

export const clipboard = {
  get items() {
    return _clipboard;
  },
  get hasItems() {
    return _clipboard.length > 0;
  },
  get pasting() {
    return _pasting;
  },
  get pastedGroups() {
    return _pastedGroups;
  },
  get pasteBBox() {
    return _pasteBBox;
  },

  copy(groups: Group[]) {
    // JSON clone → bulletproof plain objects (immune to Svelte proxy quirks).
    // Groups are pure data (points, numbers, strings), so this is lossless.
    _clipboard = JSON.parse(JSON.stringify($state.snapshot(groups))) as Group[];
  },

  beginPaste(groups: Group[], bbox: BBox) {
    _pastedGroups = groups;
    _pasteBBox = bbox;
    _pasting = true;
  },

  translatePaste(dx: number, dy: number) {
    for (const g of _pastedGroups) {
      g.bbox.x += dx;
      g.bbox.y += dy;
      if (g.stroke) for (const p of g.stroke) {
        p.x += dx;
        p.y += dy;
      }
    }
    if (_pasteBBox) {
      _pasteBBox.x += dx;
      _pasteBBox.y += dy;
    }
  },

  endPaste() {
    _pasting = false;
    _pastedGroups = [];
    _pasteBBox = null;
  },
};
