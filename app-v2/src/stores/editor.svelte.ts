// ─────────────────────────────────────────────────────────────────────────────
// Editor store — which text block is currently open in the text editor popup.
// ─────────────────────────────────────────────────────────────────────────────

let _editingId = $state<number | null>(null);

export const editor = {
  get editingId() {
    return _editingId;
  },
  open(id: number) {
    _editingId = id;
  },
  close() {
    _editingId = null;
  },
};
