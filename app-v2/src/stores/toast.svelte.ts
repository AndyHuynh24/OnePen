// ─────────────────────────────────────────────────────────────────────────────
// Toast — transient status messages (tool feedback, "coming soon", etc.).
// ─────────────────────────────────────────────────────────────────────────────

export interface Toast {
  id: number;
  text: string;
  icon?: string;
}

let _toasts = $state<Toast[]>([]);
let _seq = 0;

export const toast = {
  get list() {
    return _toasts;
  },
  show(text: string, icon = 'bx-info-circle', ms = 2200) {
    const id = ++_seq;
    _toasts = [..._toasts, { id, text, icon }];
    window.setTimeout(() => {
      _toasts = _toasts.filter((t) => t.id !== id);
    }, ms);
  },
};
