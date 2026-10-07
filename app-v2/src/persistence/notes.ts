// ─────────────────────────────────────────────────────────────────────────────
// Notes CRUD — folders + notes built on top of the path-keyed Dexie schema.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { FolderSummary, NoteListEntry, NoteRecord, SummaryMetadata } from '$types/note';
import {
  FOLDER_META_SUFFIX,
  db,
  folderOf,
  isFolderMeta,
  nameOf,
} from './db';

// ── folders ────────────────────────────────────────────────────────────────

export async function listFolders(): Promise<FolderSummary[]> {
  const counts = new Map<string, number>();
  await db().notes.each((rec) => {
    const f = folderOf(rec.path);
    if (!f) return;
    if (isFolderMeta(rec.path)) {
      if (!counts.has(f)) counts.set(f, 0);
    } else {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  });
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, noteCount]) => ({ name, noteCount }));
}

export async function createFolder(name: string): Promise<void> {
  const path = `${name}${FOLDER_META_SUFFIX}`;
  const existing = await db().notes.get(path);
  if (existing) return;
  await db().notes.put({
    path,
    content: [],
    created_at: new Date().toISOString(),
  });
}

export async function renameFolder(oldName: string, newName: string): Promise<void> {
  if (oldName === newName) return;
  const prefix = `${oldName}/`;
  const newPrefix = `${newName}/`;
  await db().transaction('rw', db().notes, async () => {
    const all = await db().notes.where('path').startsWith(prefix).toArray();
    for (const r of all) {
      const newPath = newPrefix + r.path.slice(prefix.length);
      await db().notes.delete(r.path);
      await db().notes.put({ ...r, path: newPath });
    }
  });
}

export async function deleteFolder(name: string): Promise<void> {
  const prefix = `${name}/`;
  await db().notes.where('path').startsWith(prefix).delete();
}

// ── notes ──────────────────────────────────────────────────────────────────

export async function listNotesInFolder(folder: string): Promise<NoteListEntry[]> {
  const prefix = `${folder}/`;
  const all = await db().notes.where('path').startsWith(prefix).toArray();
  return all
    .filter((r) => r.path.endsWith('.json'))
    .map((r) => ({
      path: r.path,
      createdAt: r.created_at,
      isSummaryNote: !!r.isSummaryNote,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createNote(folder: string, name: string): Promise<string> {
  const safeName = name.endsWith('.json') ? name : `${name}.json`;
  const path = `${folder}/${safeName}`;
  const existing = await db().notes.get(path);
  if (existing) throw new Error(`Note already exists: ${path}`);
  await db().notes.put({
    path,
    content: [],
    created_at: new Date().toISOString(),
  });
  return path;
}

export async function loadNote(path: string): Promise<NoteRecord | null> {
  const rec = await db().notes.get(path);
  return rec ?? null;
}

export interface SaveOptions {
  isSummaryNote?: boolean;
  summaryMetadata?: SummaryMetadata;
}

export async function saveNote(
  path: string,
  content: Group[],
  options: SaveOptions = {},
): Promise<void> {
  const prev = await db().notes.get(path);
  const created_at = prev?.created_at ?? new Date().toISOString();
  const next: NoteRecord = {
    path,
    content,
    created_at,
  };
  if (options.isSummaryNote ?? prev?.isSummaryNote) {
    next.isSummaryNote = true;
    if (options.summaryMetadata ?? prev?.summaryMetadata) {
      next.summaryMetadata = options.summaryMetadata ?? prev?.summaryMetadata;
    }
  }
  await db().notes.put(next);
}

export async function renameNote(oldPath: string, newName: string): Promise<string> {
  const rec = await db().notes.get(oldPath);
  if (!rec) throw new Error(`Note not found: ${oldPath}`);
  const folder = folderOf(oldPath);
  const safeName = newName.endsWith('.json') ? newName : `${newName}.json`;
  const newPath = `${folder}/${safeName}`;
  if (oldPath === newPath) return newPath;
  const conflict = await db().notes.get(newPath);
  if (conflict) throw new Error(`Note already exists: ${newPath}`);
  await db().transaction('rw', db().notes, async () => {
    await db().notes.delete(oldPath);
    await db().notes.put({ ...rec, path: newPath });
  });
  return newPath;
}

export async function deleteNote(path: string): Promise<void> {
  await db().notes.delete(path);
}

// ── utility: extract folder name from a note path ──────────────────────────

export { folderOf, nameOf, isFolderMeta };
