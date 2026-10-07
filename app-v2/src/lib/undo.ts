// ─────────────────────────────────────────────────────────────────────────────
// User-facing undo / redo (toolbar buttons, two-finger tap, Escape).
//
// A few actions are still "in flight" when the user hits undo — a paste preview
// or a move that hasn't been placed yet. Undo cancels those first (the content
// never moved, so there's nothing to revert) instead of reverting the action
// before them.
// ─────────────────────────────────────────────────────────────────────────────

import { history } from '$stores/history.svelte';
import { clipboard } from '$stores/clipboard.svelte';
import { moveMode } from '$stores/move.svelte';
import { getEngine } from '$canvas/engineRef';

export function undo(): boolean {
  if (clipboard.pasting) {
    clipboard.endPaste();
    history.dropLast();
    getEngine()?.invalidateLive();
    return true;
  }
  if (moveMode.active) {
    const placing = moveMode.placing;
    moveMode.end(); // discard the un-placed offset
    // placing = freshly typed text → undo removes it; otherwise a picked-but-not-
    // yet-dragged move → just cancel it
    if (placing) history.undo();
    else history.dropLast();
    getEngine()?.invalidateLive();
    getEngine()?.invalidateDrawFull();
    return true;
  }
  return history.undo();
}

export function redo(): boolean {
  if (clipboard.pasting || moveMode.active) return false;
  return history.redo();
}
