// ─────────────────────────────────────────────────────────────────────────────
// Save mirror — the save worker's copy of the open note. The main thread only
// ever sends the groups that changed; the worker holds the rest and does the
// whole-note database write, which is what used to freeze the pen.
//
// Groups are keyed by `uid`, not `id`: a uid is the group's index when the note
// was loaded (or a fresh number after that), so old notes with repeated ids can't
// lose a group here. Kept free of worker globals so tests can drive it directly.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { NoteRecord } from '$types/note';
import { fingerprintGroup } from './fingerprint';

export interface PatchItem {
  uid: number;
  group: Group;
}

export type SaveRequest =
  | { type: 'open'; session: number; path: string }
  | { type: 'patch'; session: number; items: PatchItem[] }
  | { type: 'commit'; session: number; token: number; order: Int32Array; isSummary: boolean };

export type SaveResponse =
  | { type: 'opened'; session: number; fingerprints: Int32Array }
  | { type: 'saved'; session: number; token: number }
  | { type: 'failed'; session: number; token?: number; error: string };

export interface MirrorStore {
  load(path: string): Promise<NoteRecord | null>;
  put(rec: NoteRecord): Promise<void>;
}

export function createMirror(store: MirrorStore) {
  let session = -1;
  let meta: Omit<NoteRecord, 'content'> | null = null;
  let groups = new Map<number, Group>();

  return {
    async handle(req: SaveRequest): Promise<SaveResponse | null> {
      try {
        if (req.type === 'open') {
          const rec = await store.load(req.path);
          const content = rec?.content ?? [];
          const { content: _content, ...rest } = rec ?? ({} as NoteRecord);
          session = req.session;
          meta = rec ? rest : { path: req.path, created_at: new Date().toISOString() };
          groups = new Map(content.map((g, i) => [i, g]));
          return { type: 'opened', session, fingerprints: Int32Array.from(content, fingerprintGroup) };
        }
        if (req.session !== session || !meta) throw new Error('save mirror is not open');
        if (req.type === 'patch') {
          for (const it of req.items) groups.set(it.uid, it.group);
          return null;
        }
        const content: Group[] = [];
        const kept = new Map<number, Group>();
        for (const uid of req.order) {
          const g = groups.get(uid);
          if (!g) throw new Error(`save mirror is missing group ${uid}`);
          content.push(g);
          kept.set(uid, g);
        }
        groups = kept; // erased groups go; the main thread forgets their uids too
        const rec: NoteRecord = { ...meta, content };
        if (req.isSummary) rec.isSummaryNote = true;
        await store.put(rec);
        return { type: 'saved', session, token: req.token };
      } catch (err) {
        const token = req.type === 'commit' ? req.token : undefined;
        return { type: 'failed', session: req.session, token, error: String(err) };
      }
    },
  };
}
