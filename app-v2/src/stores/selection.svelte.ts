// ─────────────────────────────────────────────────────────────────────────────
// Selection store — the media group currently in EDIT MODE (entered by a
// double-tap). Edit mode shows resize handles + the edit popup and makes the
// media draggable/resizable. `moveAll` controls whether dragging a PDF page
// moves the whole document.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { note } from './note.svelte';

let _id = $state<number | null>(null);
let _moveAll = $state<boolean>(true);

export const selection = {
  get id() {
    return _id;
  },
  get moveAll() {
    return _moveAll;
  },
  group(): Group | null {
    if (_id === null) return null;
    return note.groups.find((g) => g.id === _id) ?? null;
  },
  select(id: number) {
    _id = id;
  },
  clear() {
    _id = null;
  },
  setMoveAll(v: boolean) {
    _moveAll = v;
  },
};
