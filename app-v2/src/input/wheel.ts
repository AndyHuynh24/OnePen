// ─────────────────────────────────────────────────────────────────────────────
// Wheel input — vertical + horizontal panning, with cursor-anchored zoom on
// ctrl/cmd. Handles both mouse wheels and trackpad two-finger swipes.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '$config/constants';
import { viewport } from '$stores/viewport.svelte';
import type { CanvasEngine } from '$canvas/engine';
import type { Scroller } from './scroller';
import { screenToWorld } from '$canvas/transform';

const ZOOM_SENSITIVITY = 0.0015;
const NOTCH_PX = 50;

export function attachWheel(
  el: HTMLElement,
  engine: CanvasEngine,
  scroller: Scroller,
): { detach: () => void } {
  function onWheel(ev: WheelEvent) {
    ev.preventDefault();

    // ── zoom: cmd/ctrl + wheel anchors zoom to cursor position
    if (ev.ctrlKey || ev.metaKey) {
      scroller.stop();
      const rect = el.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const oldScale = viewport.scale;
      const factor = Math.exp(-ev.deltaY * ZOOM_SENSITIVITY);
      const newScale = Math.max(
        CONFIG.MIN_SCALE,
        Math.min(CONFIG.MAX_SCALE, oldScale * factor),
      );
      if (newScale === oldScale) return;

      // Keep the world point under the cursor stationary on screen.
      const worldUnderCursor = screenToWorld(sx, sy, oldScale, viewport.offset);
      viewport.setScale(newScale);
      const newOffset = {
        x: worldUnderCursor.x - sx / newScale,
        y: worldUnderCursor.y - sy / newScale,
      };
      viewport.setOffset(newOffset);
      engine.zoomGesture(); // sharp re-render once the wheel/trackpad zoom rests
      return;
    }

    // ── pan: wheel scrolls the canvas
    // Shift swaps vertical → horizontal (common pattern when the mouse has no
    // horizontal axis). Trackpads already emit deltaX naturally.
    let dx = ev.deltaX;
    let dy = ev.deltaY;
    if (ev.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }

    // Line-delta mode (rare; some legacy mice): scale up to pixels.
    if (ev.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    }

    // A mouse wheel moves in big steps (or whole 120-unit notches); a trackpad's
    // small deltas are already smooth. A trackpad event that looks like a notch
    // just glides a little more, so the guess can't do harm.
    const raw = (ev as WheelEvent & { wheelDelta?: number }).wheelDelta ?? 0;
    const notch =
      ev.deltaMode !== 0 || (raw !== 0 && raw % 120 === 0) || Math.hypot(dx, dy) >= NOTCH_PX;
    scroller.wheel(dx, dy, notch);
  }

  el.addEventListener('wheel', onWheel, { passive: false });
  return {
    detach() {
      el.removeEventListener('wheel', onWheel);
    },
  };
}
