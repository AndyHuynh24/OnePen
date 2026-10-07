// ─────────────────────────────────────────────────────────────────────────────
// Local gesture-feedback log — a separate IndexedDB database (`onepen-ml`) so it
// never touches the notes database's schema/versioning. Week-1 dogfooding: the
// log stays on the device and is exported as JSONL from Settings → Data. The
// same records become the upload payload once the AWS ingest exists.
// ─────────────────────────────────────────────────────────────────────────────

import Dexie, { type Table } from 'dexie';
import type { Signal, Resolution } from './rules';

export interface GestureEvent {
  schemaVersion: 1;
  eventId: string;
  /** wall-clock ms */
  ts: number;
  status: 'pending' | 'final';
  modelVersion: string;
  hold: boolean;
  predicted: string;
  confidence: number;
  decision: 'threshold' | 'fallback' | 'below';
  probs: number[];
  features: number[];
  /** stroke points: x/y world px (2 dp), t = ms since the first point, p = pressure */
  points: { x: number; y: number; t: number; p: number }[];
  context: {
    enclosedCount: number;
    intersectCount: number;
    zoom: number;
    bboxW: number;
    bboxH: number;
  };
  device: { pointerType: string };
  signals: Signal[];
  resolution: Resolution | null;
}

class MLDB extends Dexie {
  events!: Table<GestureEvent, string>;
  constructor() {
    super('onepen-ml');
    this.version(1).stores({ events: 'eventId, ts, status' });
  }
}

let _db: MLDB | null = null;
function mldb(): MLDB {
  if (!_db) _db = new MLDB();
  return _db;
}

export const eventStore = {
  async put(e: GestureEvent): Promise<void> {
    try {
      await mldb().events.put(e);
    } catch (err) {
      console.warn('[ml] could not save gesture event:', err);
    }
  },
  async all(): Promise<GestureEvent[]> {
    return mldb().events.orderBy('ts').toArray();
  },
  async clear(): Promise<void> {
    await mldb().events.clear();
  },
  async stats(): Promise<{ total: number; pending: number; suspected: number; review: number; byRule: Record<string, number> }> {
    const all = await mldb().events.toArray();
    const byRule: Record<string, number> = {};
    let pending = 0;
    let suspected = 0;
    let review = 0;
    for (const e of all) {
      if (e.status === 'pending') pending++;
      const r = e.resolution;
      if (!r) continue;
      byRule[r.rule] = (byRule[r.rule] ?? 0) + 1;
      if (r.label !== null && r.label !== e.predicted) suspected++;
      if (r.review) review++;
    }
    return { total: all.length, pending, suspected, review, byRule };
  },
};

/** Download the whole log as JSONL (one event per line). */
export async function exportJsonl(): Promise<number> {
  const events = await eventStore.all();
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  const blob = new Blob([body], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `onepen-gesture-log-${stamp}.jsonl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return events.length;
}
