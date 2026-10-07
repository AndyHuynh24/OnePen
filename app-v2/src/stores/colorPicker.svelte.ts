// ─────────────────────────────────────────────────────────────────────────────
// Global color-picker session — lets non-component code (e.g. the toolbox's
// CUSTOM_COLOR tool in tools/execute.ts) open the universal color panel at a
// screen anchor and receive the chosen color via a callback. Rendered by
// <ColorPickerOverlay>, which is mounted once in App.svelte.
// ─────────────────────────────────────────────────────────────────────────────

export interface ColorPickerSession {
  /** initial color shown in the panel */
  value: string;
  /** screen-pixel anchor (the panel centers under this point) */
  x: number;
  y: number;
  /** called for every chosen color (live preview + final) */
  onPick: (color: string) => void;
  /** Present when the picker styles a gesture selection: shows a show/hide
   *  toggle for the gesture stroke (box / curly / bracket / underline). */
  modifier?: {
    visible: boolean;
    onToggle: (visible: boolean) => void;
  };
}

let _session = $state<ColorPickerSession | null>(null);

export const colorPicker = {
  get session() {
    return _session;
  },
  get isOpen() {
    return _session !== null;
  },
  open(session: ColorPickerSession) {
    _session = session;
  },
  close() {
    _session = null;
  },
};
