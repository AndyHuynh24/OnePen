// ─────────────────────────────────────────────────────────────────────────────
// Legacy migration — read `dsh-note-db` v2 (the original OnePen IndexedDB),
// copy every record into `onepen-db` v3. Idempotent: tracked by a setting
// `legacy_migration_done`. Original DB stays intact and read-only.
// ─────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '$config/constants';
import type { NoteRecord } from '$types/note';
import { db } from './db';

const MIGRATION_KEY = 'legacy_migration_done';

interface MigrationResult {
  ran: boolean;
  notesImported: number;
  settingsImported: number;
  error?: string;
}

export async function migrateFromLegacyIfNeeded(): Promise<MigrationResult> {
  const flag = await db().setting.get(MIGRATION_KEY);
  if (flag && flag.value === true) {
    return { ran: false, notesImported: 0, settingsImported: 0 };
  }

  try {
    const legacy = await openLegacyDB();
    if (!legacy) {
      // Legacy DB doesn't exist → nothing to migrate; mark done so we skip next time.
      await db().setting.put({ key: MIGRATION_KEY, value: true });
      return { ran: false, notesImported: 0, settingsImported: 0 };
    }

    const notes = await readAllNotes(legacy);
    const settings = await readAllSettings(legacy);
    legacy.close();

    if (notes.length === 0 && settings.length === 0) {
      await db().setting.put({ key: MIGRATION_KEY, value: true });
      return { ran: false, notesImported: 0, settingsImported: 0 };
    }

    await db().transaction('rw', db().notes, db().setting, async () => {
      for (const n of notes) {
        // bulkPut would overwrite same-keyed local notes — we want migration
        // to merge, not clobber.
        const existing = await db().notes.get(n.path);
        if (!existing) await db().notes.put(n);
      }
      for (const s of settings) {
        const existing = await db().setting.get(s.key);
        if (!existing) await db().setting.put(s);
      }
      await db().setting.put({ key: MIGRATION_KEY, value: true });
    });

    console.log(
      `[migrate] imported ${notes.length} notes + ${settings.length} settings from legacy DB`,
    );
    return { ran: true, notesImported: notes.length, settingsImported: settings.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[migrate] failed:', message);
    return { ran: false, notesImported: 0, settingsImported: 0, error: message };
  }
}

function openLegacyDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(CONFIG.LEGACY_DB_NAME, CONFIG.LEGACY_DB_VERSION);

    // If the DB doesn't exist, opening will create it via onupgradeneeded —
    // we never want that. Abort the request if upgrade fires.
    let willCreate = false;
    req.onupgradeneeded = () => {
      willCreate = true;
      req.transaction?.abort();
    };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      if (willCreate) {
        try {
          req.result.close();
        } catch {
          /* ignore */
        }
        indexedDB.deleteDatabase(CONFIG.LEGACY_DB_NAME);
        resolve(null);
        return;
      }
      // Sanity: make sure the legacy stores exist.
      const stores = Array.from(req.result.objectStoreNames);
      if (!stores.includes('notes')) {
        req.result.close();
        resolve(null);
        return;
      }
      resolve(req.result);
    };
  });
}

function readAllNotes(legacy: IDBDatabase): Promise<NoteRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = legacy.transaction('notes', 'readonly');
    const store = tx.objectStore('notes');
    const out: NoteRecord[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) {
        resolve(out);
        return;
      }
      const v = cursor.value as NoteRecord;
      if (v && typeof v.path === 'string') {
        out.push(v);
      }
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

function readAllSettings(legacy: IDBDatabase): Promise<{ key: string; value: unknown }[]> {
  return new Promise((resolve) => {
    if (!Array.from(legacy.objectStoreNames).includes('setting')) {
      resolve([]);
      return;
    }
    const tx = legacy.transaction('setting', 'readonly');
    const store = tx.objectStore('setting');
    const out: { key: string; value: unknown }[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor) {
        resolve(out);
        return;
      }
      const key = String(cursor.key);
      out.push({ key, value: cursor.value });
      cursor.continue();
    };
    cursorReq.onerror = () => resolve(out);
  });
}
