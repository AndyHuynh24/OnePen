// ─────────────────────────────────────────────────────────────────────────────
// Autosave manager — debounced, idle-aware writes through Dexie. IndexedDB
// writes are already async (off the render-blocking path), so we persist
// directly and reliably rather than via a worker (which had version/availability
// edge cases that silently dropped saves). Drives the save-status indicator.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '$config/constants';
import { note } from '$stores/note.svelte';
import { saveState } from '$stores/save.svelte';
import { saveNote } from './notes';

let _debounceTimer: number | null = null;
let _lastActivity = performance.now();
let _saving = false;

/** Mark recent pointer/input activity so autosave can wait for an idle gap. */
export function noteActivity(): void {
  _lastActivity = performance.now();
}

/** Mark the note dirty + schedule an autosave. */
export function markDirty(): void {
  note.markDirty();
  if (note.path) saveState.set('dirty');
  if (_debounceTimer !== null) clearTimeout(_debounceTimer);
  _debounceTimer = window.setTimeout(attemptAutosave, CONFIG.AUTOSAVE_DEBOUNCE_MS);
}

async function attemptAutosave(): Promise<void> {
  _debounceTimer = null;
  if (!note.dirty || !note.path) return;
  if (_saving) {
    // a save is in flight; re-check shortly after it lands
    _debounceTimer = window.setTimeout(attemptAutosave, 300);
    return;
  }

  const idle = performance.now() - _lastActivity;
  if (idle < CONFIG.AUTOSAVE_IDLE_MS) {
    _debounceTimer = window.setTimeout(attemptAutosave, CONFIG.AUTOSAVE_IDLE_MS - idle + 50);
    return;
  }

  await flushNow();
}

/** Force-save the current note immediately. Returns true on success. */
export async function flushNow(): Promise<boolean> {
  const path = note.path;
  if (!path) return false;
  if (_saving) return false;

  _saving = true;
  saveState.set('saving');
  try {
    const content = note.snapshot();
    await saveNote(path, content, { isSummaryNote: note.isSummary });
    note.markClean();
    saveState.set('saved');
    return true;
  } catch (err) {
    console.error('[autosave] save failed:', err);
    saveState.set('error');
    return false;
  } finally {
    _saving = false;
  }
}

/** beforeunload + visibility safety-net saves. */
export function installLifecycleHooks(): void {
  window.addEventListener('beforeunload', () => {
    if (note.dirty && note.path) void flushNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && note.dirty && note.path) void flushNow();
  });
}
