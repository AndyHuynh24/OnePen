// ─────────────────────────────────────────────────────────────────────────────
// Embed store — which link group's embedded web frame is currently open.
// ─────────────────────────────────────────────────────────────────────────────

let _linkId = $state<number | null>(null);

export const embed = {
  get linkId() {
    return _linkId;
  },
  get open() {
    return _linkId !== null;
  },
  show(id: number) {
    _linkId = id;
  },
  close() {
    _linkId = null;
  },
};
