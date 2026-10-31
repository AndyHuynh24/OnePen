// ─────────────────────────────────────────────────────────────────────────────
// Save worker. Every note write happens HERE, never on the main thread: writing
// a note costs time in proportion to its whole size, and on the main thread that
// time came straight out of pen input. See saveMirror.ts + autosave.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from './db';
import { createMirror, type SaveRequest, type SaveResponse } from './saveMirror';

const mirror = createMirror({
  load: async (path) => (await db().notes.get(path)) ?? null,
  put: async (rec) => {
    await db().notes.put(rec);
  },
});

// one at a time, in arrival order: a commit must see every patch sent before it
let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<SaveRequest>) => {
  queue = queue.then(async () => {
    const res = await mirror.handle(e.data);
    if (!res) return;
    const post = self.postMessage as (m: SaveResponse, t?: Transferable[]) => void;
    post(res, res.type === 'opened' ? [res.fingerprints.buffer] : []);
  });
};
