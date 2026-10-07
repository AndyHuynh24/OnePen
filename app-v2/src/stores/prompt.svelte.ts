// ─────────────────────────────────────────────────────────────────────────────
// Prompt store — a Promise-based replacement for window.prompt() / window.confirm()
// that renders a real themed modal instead of relying on browser chrome.
// ─────────────────────────────────────────────────────────────────────────────

export interface PromptRequest {
  kind: 'text';
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  resolve: (value: string | null) => void;
}

export interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  body?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
}

export type ModalRequest = PromptRequest | ConfirmRequest;

let _active = $state<ModalRequest | null>(null);

export const modal = {
  get active() {
    return _active;
  },

  /** Prompt the user for a text value. Resolves to null if cancelled. */
  prompt(opts: Omit<PromptRequest, 'kind' | 'resolve'>): Promise<string | null> {
    return new Promise((resolve) => {
      _active = { kind: 'text', ...opts, resolve };
    });
  },

  /** Ask the user a yes/no question. Resolves to false if cancelled. */
  confirm(opts: Omit<ConfirmRequest, 'kind' | 'resolve'>): Promise<boolean> {
    return new Promise((resolve) => {
      _active = { kind: 'confirm', ...opts, resolve };
    });
  },

  /** Resolve the current modal and clear it. */
  resolve(value: string | boolean | null) {
    if (!_active) return;
    if (_active.kind === 'text') {
      _active.resolve(value as string | null);
    } else {
      _active.resolve(value as boolean);
    }
    _active = null;
  },
};
