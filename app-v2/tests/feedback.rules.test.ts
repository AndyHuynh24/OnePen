// Gesture feedback: similarity ("is this a redraw?") and the detection rules.

import { describe, it, expect } from 'vitest';
import { shapeOf, isSimilar, bboxIoU } from '../src/ml/similarity';
import { resolveGesture, labelForToolbox, type GestureFacts, type LaterStroke } from '../src/ml/rules';
import type { Point } from '../src/types/geometry';

function rect(x: number, y: number, w: number, h: number, startCorner = 0): Point[] {
  const c = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const pts: Point[] = [];
  for (let k = 0; k <= 4; k++) {
    const a = c[(k + startCorner) % 4];
    const b = c[(k + 1 + startCorner) % 4];
    if (k === 4) break;
    for (let i = 0; i < 10; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / 10, y: a.y + ((b.y - a.y) * i) / 10 });
  }
  pts.push({ ...c[startCorner % 4] });
  return pts;
}
function line(x: number, y: number, w: number): Point[] {
  return Array.from({ length: 20 }, (_, i) => ({ x: x + (w * i) / 19, y: y + Math.sin(i) * 0.5 }));
}

describe('similarity', () => {
  it('a box redrawn from another corner, slightly offset, is similar', () => {
    expect(isSimilar(shapeOf(rect(0, 0, 100, 60)), shapeOf(rect(4, 3, 96, 62, 2)))).toBe(true);
  });
  it('a box and a line in the same place are not similar', () => {
    expect(isSimilar(shapeOf(rect(0, 0, 100, 60)), shapeOf(line(0, 30, 100)))).toBe(false);
  });
  it('the same shape somewhere else is not similar', () => {
    expect(isSimilar(shapeOf(rect(0, 0, 100, 60)), shapeOf(rect(300, 0, 100, 60)))).toBe(false);
  });
  it('flat underlines a few px apart still overlap', () => {
    expect(bboxIoU(shapeOf(line(0, 50, 200)).bbox, shapeOf(line(5, 54, 195)).bbox)).toBeGreaterThan(0.5);
  });
});

const BOX = shapeOf(rect(0, 0, 100, 60));
const T0 = 1_000_000;

function g(over: Partial<GestureFacts>): GestureFacts {
  return { ts: T0, hold: false, predicted: 'box', shape: BOX, signals: [], ...over };
}
function later(over: Partial<LaterStroke>): LaterStroke {
  return { ts: T0 + 5000, shape: BOX, hold: false, label: 'none', toolboxSelected: null, reverted: false, ...over };
}

describe('resolveGesture', () => {
  it('R7: nothing negative → keep the prediction', () => {
    expect(resolveGesture(g({}), [], 0.5)).toMatchObject({ label: 'box', rule: 'R7', trust: 0.6, review: false });
  });

  it('R1: undone then redrawn as something else → the redraw is the truth', () => {
    const r = resolveGesture(
      g({ predicted: 'box', signals: [{ kind: 'undone', ts: T0 + 2000 }] }),
      [later({ ts: T0 + 4000, label: 'circlebracket' })],
    );
    expect(r).toMatchObject({ label: 'circlebracket', rule: 'R1', trust: 0.85 });
  });

  it('A-type: box undone, redrawn as plain ink → none', () => {
    const r = resolveGesture(
      g({ signals: [{ kind: 'undone', ts: T0 + 1500 }] }),
      [later({ ts: T0 + 3000, label: 'none' })],
    );
    expect(r).toMatchObject({ label: 'none', rule: 'R1' });
  });

  it('R2: undone with no redraw → probably none, low trust, review', () => {
    const r = resolveGesture(g({ signals: [{ kind: 'undone', ts: T0 + 1000 }] }), []);
    expect(r).toMatchObject({ label: 'none', rule: 'R2', trust: 0.3, review: true });
  });

  it('R3: erased then redrawn', () => {
    const r = resolveGesture(
      g({ signals: [{ kind: 'erased', ts: T0 + 1000 }] }),
      [later({ ts: T0 + 3000, label: 'curly' })],
    );
    expect(r).toMatchObject({ label: 'curly', rule: 'R3' });
  });

  it('R4: a reversed delete always goes to review', () => {
    const r = resolveGesture(
      g({ predicted: 'delete', signals: [{ kind: 'undone', ts: T0 + 1000 }] }),
      [later({ ts: T0 + 3000, label: 'none' })],
    );
    expect(r.review).toBe(true);
  });

  it('R6: missed gesture — none undone, redrawn and recognized', () => {
    const r = resolveGesture(
      g({ predicted: 'none', signals: [{ kind: 'undone', ts: T0 + 1000 }] }),
      [later({ ts: T0 + 3000, label: 'box' })],
    );
    expect(r).toMatchObject({ label: 'box', rule: 'R6', trust: 0.85 });
  });

  it('undo long after, or after many strokes, is not a signal', () => {
    expect(resolveGesture(g({ signals: [{ kind: 'undone', ts: T0 + 20_000 }] }), []).rule).toBe('R7');
    const busy = [1, 2, 3, 4].map((i) => later({ ts: T0 + i * 500, shape: shapeOf(line(0, 200 + i * 30, 50)) }));
    expect(resolveGesture(g({ signals: [{ kind: 'undone', ts: T0 + 3000 }] }), busy).rule).toBe('R7');
  });

  it('undone then redone → the prediction stood', () => {
    const r = resolveGesture(
      g({ signals: [{ kind: 'undone', ts: T0 + 1000 }, { kind: 'redone', ts: T0 + 2000 }] }),
      [],
    );
    expect(r).toMatchObject({ label: 'box', rule: 'R7-redone' });
  });

  it('a redraw that was itself undone does not count', () => {
    const r = resolveGesture(
      g({ signals: [{ kind: 'undone', ts: T0 + 1000 }] }),
      [later({ ts: T0 + 3000, label: 'circlebracket', reverted: true })],
    );
    expect(r.rule).toBe('R2');
  });

  it('R5: toolbox tool picked → confirms the toolbox kind', () => {
    const r = resolveGesture(
      g({ hold: true, signals: [{ kind: 'toolboxSelected', ts: T0 + 800, toolbox: 'box', tool: 'move' }] }),
      [],
    );
    expect(r).toMatchObject({ label: 'box', rule: 'R5-selected', trust: 0.9 });
  });

  it('R5: toolbox dismissed, similar re-hold picks from a different toolbox', () => {
    const r = resolveGesture(
      g({ hold: true, predicted: 'box', signals: [{ kind: 'toolboxDismissed', ts: T0 + 800, toolbox: 'box' }] }),
      [later({ ts: T0 + 3000, hold: true, toolboxSelected: 'curly' })],
    );
    expect(r).toMatchObject({ label: 'curly', rule: 'R5', trust: 0.9 });
  });

  it('labelForToolbox maps toolbox kinds to model labels', () => {
    expect(labelForToolbox('press', 'none')).toBe('none');
    expect(labelForToolbox('squareBracket', 'wavybracket')).toBe('wavybracket'); // synced bracket toolboxes
    expect(labelForToolbox('circleBracket', 'box')).toBe('circlebracket');
  });
});
