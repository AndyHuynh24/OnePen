// ─────────────────────────────────────────────────────────────────────────────
// Math-verify store — which math_result is showing its "what the OCR read" popup.
// Two open modes:
//   • auto (just solved): runs a 3s countdown then auto-hides.
//   • pinned (user tapped the answer): stays open until a tap outside / Esc,
//     like the sticky-note popup. No timer.
// `editing` switches the popup to the calculator input pad.
// ─────────────────────────────────────────────────────────────────────────────

let _id = $state<number | null>(null);
let _editing = $state(false);
let _pinned = $state(false);
let _nonce = $state(0); // bumped to restart the countdown on re-open

export const mathVerify = {
  get id() {
    return _id;
  },
  get editing() {
    return _editing;
  },
  get pinned() {
    return _pinned;
  },
  get nonce() {
    return _nonce;
  },
  /** Auto-show after solving — runs the 3s countdown, then hides. */
  open(id: number) {
    _id = id;
    _editing = false;
    _pinned = false;
    _nonce++;
  },
  /** User tapped the answer — stays open (no timer) until tap-outside / Esc. */
  pin(id: number) {
    _id = id;
    _editing = false;
    _pinned = true;
    _nonce++;
  },
  /** Switch the open popup into edit (calculator pad) mode. */
  edit() {
    _editing = true;
  },
  close() {
    _id = null;
    _editing = false;
    _pinned = false;
  },
};
