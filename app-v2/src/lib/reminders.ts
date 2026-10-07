// ─────────────────────────────────────────────────────────────────────────────
// Reminder scan — collect every reminder across all notebooks for the panel.
// One entry per reminderGroupId; bbox is the union of its tagged strokes. The
// currently-open note is read live (note.groups) so unsaved reminders show too.
// ─────────────────────────────────────────────────────────────────────────────

import { listFolders, listNotesInFolder, loadNote, saveNote, nameOf, folderOf } from '$persistence/notes';
import { note } from '$stores/note.svelte';
import { markDirty } from '$persistence/autosave';
import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';

/** lightweight stroke for the panel thumbnail (world coords) */
export interface ThumbStroke {
  points: { x: number; y: number }[];
  color: string;
  size: number;
}

export interface ReminderEntry {
  notePath: string;
  noteName: string;
  folder: string;
  reminderGroupId: string;
  date: string;
  bbox: BBox;
  overdue: boolean;
  strokes: ThumbStroke[];
}

interface Acc {
  date: string;
  bbox: BBox;
  strokes: ThumbStroke[];
}

function collectFromGroups(groups: Group[]): Map<string, Acc> {
  const byGroup = new Map<string, Acc>();
  for (const g of groups) {
    if (!g.reminderStatus || !g.reminderGroupId || !g.bbox) continue;
    let cur = byGroup.get(g.reminderGroupId);
    if (!cur) {
      cur = { date: g.reminderDate ?? '', bbox: { ...g.bbox }, strokes: [] };
      byGroup.set(g.reminderGroupId, cur);
    } else {
      const x2 = Math.max(cur.bbox.x + cur.bbox.w, g.bbox.x + g.bbox.w);
      const y2 = Math.max(cur.bbox.y + cur.bbox.h, g.bbox.y + g.bbox.h);
      cur.bbox.x = Math.min(cur.bbox.x, g.bbox.x);
      cur.bbox.y = Math.min(cur.bbox.y, g.bbox.y);
      cur.bbox.w = x2 - cur.bbox.x;
      cur.bbox.h = y2 - cur.bbox.y;
    }
    if (g.stroke && g.stroke.length > 0) {
      cur.strokes.push({
        points: g.stroke.map((p) => ({ x: p.x, y: p.y })),
        color: g.color || '#888',
        size: g.size || 2,
      });
    }
  }
  return byGroup;
}

export async function scanAllReminders(): Promise<ReminderEntry[]> {
  const folders = await listFolders();
  const now = Date.now();
  const entries: ReminderEntry[] = [];

  for (const f of folders) {
    const notes = await listNotesInFolder(f.name);
    for (const n of notes) {
      // use live groups for the open note so unsaved reminders are included
      const groups =
        n.path === note.path ? note.groups : ((await loadNote(n.path))?.content ?? []);
      for (const [gid, v] of collectFromGroups(groups)) {
        entries.push({
          notePath: n.path,
          noteName: nameOf(n.path),
          folder: folderOf(n.path),
          reminderGroupId: gid,
          date: v.date,
          bbox: v.bbox,
          overdue: v.date ? new Date(v.date).getTime() < now : false,
          strokes: v.strokes,
        });
      }
    }
  }

  // soonest first; undated last
  entries.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  return entries;
}

/** Remove the reminder tag from the strokes it marks — KEEPS the strokes (only
 *  the notification/deadline is cleared). Matches the original's deleteReminder.
 *  Works on the open note (live, via the note store) or any other note. */
export async function deleteReminder(notePath: string, reminderGroupId: string): Promise<void> {
  const clear = (g: Group) => {
    if (g.reminderGroupId === reminderGroupId) {
      g.reminderStatus = false;
      g.reminderDate = undefined;
      g.reminderGroupId = undefined;
    }
  };

  if (notePath === note.path) {
    for (const g of note.groups) clear(g);
    note.commit();
    markDirty();
    return;
  }

  const rec = await loadNote(notePath);
  if (!rec) return;
  for (const g of rec.content) clear(g);
  await saveNote(notePath, rec.content, {
    isSummaryNote: rec.isSummaryNote,
    summaryMetadata: rec.summaryMetadata,
  });
}
