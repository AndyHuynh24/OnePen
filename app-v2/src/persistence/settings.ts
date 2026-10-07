// ─────────────────────────────────────────────────────────────────────────────
// Settings — typed key-value store backed by the `setting` table.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from './db';

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const rec = await db().setting.get(key);
  return rec?.value as T | undefined;
}

export async function setSetting<T = unknown>(key: string, value: T): Promise<void> {
  await db().setting.put({ key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  await db().setting.delete(key);
}

// ── well-known setting keys ────────────────────────────────────────────────

export const SETTING_KEYS = {
  LAST_SAVE_NOTE: 'lastSaveNote',
  TOOLBOX_SETTINGS: 'toolboxSettings', // also holds the AI-gestures toggle
  GRID_STYLE: 'gridStyle',
  NOTEBOOK_COLORS: 'notebookColors',
} as const;

export interface LastSaveNote {
  path: string;
  viewportOffset?: { x: number; y: number };
  scale?: number;
}
