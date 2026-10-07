// ─────────────────────────────────────────────────────────────────────────────
// Scroll-activity signal — drives the auto-hiding scrollbar + zoom indicator.
// ─────────────────────────────────────────────────────────────────────────────

let _scrollActive = $state(false);
let _scrollTimer: number | null = null;

let _zoomTick = $state(0);
let _lastPing = 0;
const HIDE_MS = 1200;

function expire() {
  const left = HIDE_MS - (performance.now() - _lastPing);
  if (left > 16) {
    _scrollTimer = window.setTimeout(expire, left);
    return;
  }
  _scrollTimer = null;
  _scrollActive = false;
}

export const scrollSignal = {
  get scrollActive() {
    return _scrollActive;
  },
  get zoomTick() {
    return _zoomTick;
  },
  /** Call on any pan/scroll movement to reveal the scrollbar for ~1.2s. Called
   *  per pointer/wheel event, so it only touches reactive state when the
   *  scrollbar actually appears, and re-arms one timer instead of a new one each
   *  event. */
  pingScroll() {
    _lastPing = performance.now();
    if (!_scrollActive) _scrollActive = true;
    if (_scrollTimer === null) _scrollTimer = window.setTimeout(expire, HIDE_MS);
  },
  /** Call on any zoom change to reveal the zoom indicator. */
  pingZoom() {
    _zoomTick++;
  },
};
