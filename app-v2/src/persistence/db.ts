// ─────────────────────────────────────────────────────────────────────────────
// Dexie database — `onepen-db` v3.
//   notes:   keyed by path ("Folder/note.json" or "Folder/__folder__.meta")
//   setting: keyed by setting name
//
// The schema layout (path-as-key, folder-meta-marker) is preserved from the
// original `dsh-note-db` v2 so the legacy migrator can copy records verbatim.
// ─────────────────────────────────────────────────────────────────────────────

import Dexie, { type Table } from 'dexie';
import type { NoteRecord } from '$types/note';
import { CONFIG } from '$config/constants';

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class OnePenDB extends Dexie {
  notes!: Table<NoteRecord, string>;
  setting!: Table<SettingRecord, string>;

  constructor() {
    super(CONFIG.DB_NAME);
    this.version(CONFIG.DB_VERSION).stores({
      notes: 'path, created_at, isSummaryNote',
      setting: 'key',
    });
  }
}

let _instance: OnePenDB | null = null;

export function db(): OnePenDB {
  if (!_instance) _instance = new OnePenDB();
  return _instance;
}

export const FOLDER_META_SUFFIX = '/__folder__.meta';

export function isFolderMeta(path: string): boolean {
  return path.endsWith(FOLDER_META_SUFFIX);
}

export function folderOf(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? path : path.slice(0, i);
}

export function nameOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}
