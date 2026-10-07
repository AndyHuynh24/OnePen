// ─────────────────────────────────────────────────────────────────────────────
// Shared reference to the live CanvasEngine instance, so stores/tools outside
// the component tree (e.g. the tape reveal animation) can request redraws
// without threading the engine through every call.
// ─────────────────────────────────────────────────────────────────────────────

import type { CanvasEngine } from './engine';

let _engine: CanvasEngine | null = null;

export function setEngine(e: CanvasEngine | null): void {
  _engine = e;
}
export function getEngine(): CanvasEngine | null {
  return _engine;
}
