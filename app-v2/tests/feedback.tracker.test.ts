// End-to-end: a real undo through the history store reaches the feedback tracker,
// and the gesture resolves as a misread (R1) once the user redraws it as ink.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Group } from '../src/types/group';
import type { Point } from '../src/types/geometry';

vi.mock('../src/persistence/autosave', () => ({ markDirty: () => {}, noteActivity: () => {} }));
const saved = new Map<string, unknown>();
vi.mock('../src/ml/eventStore', () => ({
  eventStore: { put: async (e: { eventId: string }) => void saved.set(e.eventId, structuredClone(e)) },
}));

const { note } = await import('../src/stores/note.svelte');
const { history } = await import('../src/stores/history.svelte');
const { gestureFeedback } = await import('../src/ml/feedback');

const box: Point[] = [
  { x: 0, y: 0, t: 0 },
  { x: 100, y: 0, t: 50 },
  { x: 100, y: 60, t: 100 },
  { x: 0, y: 60, t: 150 },
  { x: 0, y: 0, t: 200 },
];

function result(label: string, modifier: Group | null, withModel = true) {
  return {
    predictedLabel: label,
    modifier,
    modifiedGroups: [],
    toolboxIntent: null,
    prediction: withModel
      ? {
          stroke: box,
          predictedLabel: label,
          confidence: 0.9,
          probabilities: [0, 0.9, 0, 0, 0, 0, 0, 0.1],
          features: new Array(12).fill(0),
          decision: 'threshold',
          modelVersion: 'test',
          timestamp: 0,
        }
      : null,
    context: { enclosedCount: 3, intersectCount: 0 },
  } as never;
}

/** One pen stroke through the real history store, like pointer.finishStroke. */
function drawStroke(label: string, withModel: boolean) {
  const tx = history.begin({ auto: true });
  const g = { id: note.nextId(), type: 'stroke', color: '#000', size: 2, stroke: box, bbox: { x: 0, y: 0, w: 100, h: 60 } } as Group;
  note.groups.push(g);
  note.commit();
  history.commit(tx);
  gestureFeedback.onStroke({ seq: tx.seq, stroke: box, result: result(label, g, withModel), hold: false, pointerType: 'pen', zoom: 1 });
}

beforeEach(() => {
  vi.useFakeTimers();
  saved.clear();
  note.set([], 'test');
  history.clear();
  gestureFeedback.setEnabled(true);
  gestureFeedback.init();
});

describe('gesture feedback tracker', () => {
  it('box undone then redrawn as plain ink → logged as a misread (label none)', () => {
    drawStroke('box', true);
    vi.advanceTimersByTime(1000);
    history.undo();
    vi.advanceTimersByTime(1000);
    drawStroke('none', false); // the redraw, small enough to never reach the model
    gestureFeedback.flushAll();

    const events = [...saved.values()] as { predicted: string; signals: { kind: string }[]; resolution: { label: string; rule: string } }[];
    expect(events).toHaveLength(1);
    expect(events[0].signals.map((s) => s.kind)).toEqual(['undone']);
    expect(events[0].resolution).toMatchObject({ label: 'none', rule: 'R1' });
    vi.useRealTimers();
  });

  it('nothing logged when the log is turned off', () => {
    gestureFeedback.setEnabled(false);
    drawStroke('box', true);
    expect(saved.size).toBe(0);
    vi.useRealTimers();
  });
});
