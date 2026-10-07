// ─────────────────────────────────────────────────────────────────────────────
// Google Drive backup / restore. Backs up ALL notes + settings into a single
// `onepen_backup.json` file in the user's Drive (drive.file scope), and restores
// from it. Faithful port of silentBackupToDrive / restoreFromDrive in signin.js,
// reading/writing the v2 Dexie store instead of raw IndexedDB.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '$persistence/db';
import { CONFIG } from '$config/constants';
import type { NoteRecord } from '$types/note';

const BACKUP_FILENAME = CONFIG.DRIVE.BACKUP_FILENAME;

export interface BackupPayload {
  type: 'onepen-data';
  version: 1;
  scope: 'backup';
  generated_at: string;
  notes: Record<string, NoteRecord>;
  settings: Record<string, unknown>;
}

/** Snapshot the whole local DB into a backup payload. */
async function buildBackupPayload(): Promise<BackupPayload> {
  const notes: Record<string, NoteRecord> = {};
  await db().notes.each((rec) => {
    notes[rec.path] = rec;
  });
  const settings: Record<string, unknown> = {};
  await db().setting.each((rec) => {
    settings[rec.key] = rec.value;
  });
  return {
    type: 'onepen-data',
    version: 1,
    scope: 'backup',
    generated_at: new Date().toISOString(),
    notes,
    settings,
  };
}

async function findBackupFileId(token: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILENAME}' and trashed=false`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

/** Upload the local DB to Drive (creates or overwrites the single backup file). */
export async function backupToDrive(token: string): Promise<void> {
  const payload = await buildBackupPayload();
  const jsonContent = JSON.stringify(payload);

  const existingId = await findBackupFileId(token);

  const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };
  const boundary = '-------314159265358979323846';
  const body =
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    jsonContent +
    `\r\n--${boundary}--`;

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  });
  if (!res.ok) {
    let msg = `Upload failed: ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error?.message ?? msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
}

/** Pull the Drive backup and overwrite the local DB with it. */
export async function restoreFromDrive(token: string): Promise<void> {
  const id = await findBackupFileId(token);
  if (!id) throw new Error('No backup found');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const data = (await res.json()) as BackupPayload;
  if (data.type !== 'onepen-data' || data.scope !== 'backup') {
    throw new Error('Invalid backup file');
  }

  await db().transaction('rw', db().notes, db().setting, async () => {
    for (const rec of Object.values(data.notes)) await db().notes.put(rec);
    for (const [key, value] of Object.entries(data.settings ?? {})) {
      await db().setting.put({ key, value });
    }
  });
}
