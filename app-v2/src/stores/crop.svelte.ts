// ─────────────────────────────────────────────────────────────────────────────
// Crop store — which media group is currently being cropped (drives the modal
// crop overlay).
// ─────────────────────────────────────────────────────────────────────────────

let _mediaId = $state<number | null>(null);

export const crop = {
  get active() {
    return _mediaId !== null;
  },
  get mediaId() {
    return _mediaId;
  },
  begin(id: number) {
    _mediaId = id;
  },
  end() {
    _mediaId = null;
  },
};
