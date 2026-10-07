// ─────────────────────────────────────────────────────────────────────────────
// Save-status store — drives the on-screen autosave indicator.
// ─────────────────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

let _status = $state<SaveStatus>('idle');

export const saveState = {
  get status() {
    return _status;
  },
  set(status: SaveStatus) {
    _status = status;
  },
};
