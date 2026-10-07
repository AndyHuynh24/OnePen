// ─────────────────────────────────────────────────────────────────────────────
// Init — runs once at app boot. Handles migration, restores last note + view.
// ─────────────────────────────────────────────────────────────────────────────

import { note } from '$stores/note.svelte';
import { notebook } from '$stores/notebook.svelte';
import { ui } from '$stores/ui.svelte';
import { viewport } from '$stores/viewport.svelte';
import { tools } from '$stores/tools.svelte';
import { grid } from '$stores/grid.svelte';
import { notebookColors } from '$stores/notebookColors.svelte';
import { migrateFromLegacyIfNeeded } from './migrate';
import { listFolders, listNotesInFolder, loadNote } from './notes';
import { folderOf } from './db';
import { getSetting, setSetting, SETTING_KEYS, type LastSaveNote } from './settings';
import { installLifecycleHooks } from './autosave';

export interface InitReport {
  migrationRan: boolean;
  migratedNotes: number;
  migratedSettings: number;
  folderCount: number;
  restoredPath: string | null;
}

export async function initPersistence(): Promise<InitReport> {
  installLifecycleHooks();

  const m = await migrateFromLegacyIfNeeded();

  // restore + persist the toolbox / modifier settings (radial toolbox editor)
  const toolSettings = await getSetting<Record<string, unknown>>(SETTING_KEYS.TOOLBOX_SETTINGS);
  if (toolSettings) tools.hydrate(toolSettings as Parameters<typeof tools.hydrate>[0]);
  // open with the configured Default Pen (after settings load so it uses the
  // persisted default, not the hard-coded fallback).
  tools.useDefaultPen();
  tools.onSettingsChange(() => {
    void setSetting(SETTING_KEYS.TOOLBOX_SETTINGS, tools.settingsSnapshot());
  });

  // restore + persist the grid layout (style + size)
  const gridSettings = await getSetting<Record<string, unknown>>(SETTING_KEYS.GRID_STYLE);
  if (gridSettings) grid.hydrate(gridSettings as Parameters<typeof grid.hydrate>[0]);
  grid.onChange(() => {
    void setSetting(SETTING_KEYS.GRID_STYLE, grid.snapshot());
  });

  // restore + persist per-notebook color overrides
  const colorOverrides = await getSetting<Record<string, number>>(SETTING_KEYS.NOTEBOOK_COLORS);
  if (colorOverrides) notebookColors.hydrate(colorOverrides);
  notebookColors.onChange(() => {
    void setSetting(SETTING_KEYS.NOTEBOOK_COLORS, notebookColors.snapshot());
  });

  const folders = await listFolders();
  notebook.setFolders(folders);

  const last = await getSetting<LastSaveNote>(SETTING_KEYS.LAST_SAVE_NOTE);
  let restoredPath: string | null = null;

  if (last?.path) {
    const rec = await loadNote(last.path);
    if (rec) {
      note.set(rec.content, rec.path, !!rec.isSummaryNote);
      restoredPath = rec.path;
      const folder = folderOf(rec.path);
      ui.selectFolder(folder);
      notebook.setNotesInFolder(await listNotesInFolder(folder));
      // scale first: setOffset snaps to device pixels at the current scale
      if (last.scale) viewport.setScale(last.scale);
      if (last.viewportOffset) viewport.setOffset(last.viewportOffset);
    }
  }

  return {
    migrationRan: m.ran,
    migratedNotes: m.notesImported,
    migratedSettings: m.settingsImported,
    folderCount: folders.length,
    restoredPath,
  };
}
