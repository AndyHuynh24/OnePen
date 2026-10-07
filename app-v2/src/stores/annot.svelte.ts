// ─────────────────────────────────────────────────────────────────────────────
// Annotation-edit store — which stroke annotation currently has its editor open.
// Link and sticky annotations are applied to selected strokes via the toolbox;
// tapping one (or creating one) opens the matching editor here. Distinct from
// `selection` (media cards) — these annotations are anchored to their strokes and
// are not draggable.
// ─────────────────────────────────────────────────────────────────────────────

let _linkEditId = $state<number | null>(null);
let _stickyId = $state<number | null>(null);

export const annot = {
  get linkEditId() {
    return _linkEditId;
  },
  get stickyId() {
    return _stickyId;
  },
  editLink(id: number) {
    _linkEditId = id;
    _stickyId = null;
  },
  closeLink() {
    _linkEditId = null;
  },
  openSticky(id: number) {
    _stickyId = id;
    _linkEditId = null;
  },
  closeSticky() {
    _stickyId = null;
  },
  clear() {
    _linkEditId = null;
    _stickyId = null;
  },
};
