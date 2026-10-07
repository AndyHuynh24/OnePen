// ─────────────────────────────────────────────────────────────────────────────
// Palm rejection — ignore finger touches within a cooldown of the last pen
// event. Touches whose radius is too large (palm-sized) are also rejected.
// ─────────────────────────────────────────────────────────────────────────────

const PEN_COOLDOWN_MS = 600;
const GESTURE_COOLDOWN_MS = 150; // just enough to debounce a stray pan as fingers lift
const MAX_TOUCH_RADIUS = 35; // matches the original; smaller wrongly rejects fingertips

let lastPenUseTime = 0;
let lastGestureTime = 0;

export function notePenActivity(): void {
  lastPenUseTime = performance.now();
}

export function isInPenCooldown(): boolean {
  return performance.now() - lastPenUseTime < PEN_COOLDOWN_MS;
}

/** Mark a multi-finger gesture (pinch / 2-finger tap) so a stray single-touch
 *  pan doesn't fire right after the fingers lift. Used from Phase 7 gestures. */
export function noteGestureActivity(): void {
  lastGestureTime = performance.now();
}

export function isInGestureCooldown(): boolean {
  return performance.now() - lastGestureTime < GESTURE_COOLDOWN_MS;
}

export function isPalmTouch(ev: PointerEvent): boolean {
  if (ev.pointerType !== 'touch') return false;
  const radius = Math.max(ev.width ?? 0, ev.height ?? 0) / 2;
  return radius > MAX_TOUCH_RADIUS;
}
