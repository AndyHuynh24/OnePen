// Regression test for the "recolor doesn't repaint until you scroll" bug.
//
// CanvasEngine's incremental append path skips the full clear+redraw when the
// only change is appended strokes. It decides that by OBJECT IDENTITY on the
// prefix — so a group recolored in place still looks unchanged, and the stale
// pixels stay on screen until something forces a full redraw (like a scroll).
// invalidateDrawFull() is what mutators must call. These tests pin that contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Group } from '../src/types/group';

const drawn: { color: string }[] = [];
let cleared = 0;

vi.mock('../src/canvas/render/stroke', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/canvas/render/stroke')>()),
  drawStroke: (_ctx: unknown, _pts: unknown, o: { color: string }) => drawn.push({ color: o.color }),
}));
vi.mock('../src/canvas/render/grid', () => ({ drawGrid: () => {} }));

const { CanvasEngine } = await import('../src/canvas/engine');
const { note } = await import('../src/stores/note.svelte');

function fakeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'clearRect') return () => void cleared++;
        return () => {};
      },
      set: () => true,
    },
  );
  return { getContext: () => ctx, style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
}

function stroke(id: number, color: string): Group {
  return {
    id,
    type: 'stroke',
    stroke: [
      { x: id * 20, y: 10 },
      { x: id * 20 + 10, y: 20 },
    ],
    bbox: { x: id * 20, y: 10, w: 10, h: 10 },
    color,
    size: 2.3,
    visibility: true,
  } as Group;
}

/** Run the engine's pending rAF callback synchronously. */
function flush() {
  const cbs = rafQueue.splice(0);
  for (const cb of cbs) cb(0);
}

let rafQueue: FrameRequestCallback[] = [];

describe('CanvasEngine draw invalidation', () => {
  let engine: InstanceType<typeof CanvasEngine>;

  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    drawn.length = 0;
    cleared = 0;
    note.set([stroke(1, '#111111'), stroke(2, '#111111')], '/t.json');
    engine = new CanvasEngine({
      background: fakeCanvas(),
      draw: fakeCanvas(),
      live: fakeCanvas(),
      getSize: () => ({ w: 800, h: 600 }),
    });
    flush(); // initial full render
    drawn.length = 0;
    cleared = 0;
  });

  it('invalidateDraw takes the append path — recolored ink is NOT repainted', () => {
    // simulate classifyStroke: recolor in place + append the modifier stroke
    for (const g of note.groups) g.color = '#ffb6ff';
    note.groups.push(stroke(3, '#ffb6ff'));

    engine.invalidateDraw();
    flush();

    expect(cleared).toBe(0); // append path: no full clear
    expect(drawn.map((d) => d.color)).toEqual(['#ffb6ff']); // only the new stroke
  });

  it('invalidateDrawFull repaints every group with its new color', () => {
    for (const g of note.groups) g.color = '#ffb6ff';
    note.groups.push(stroke(3, '#ffb6ff'));

    engine.invalidateDrawFull();
    flush();

    expect(cleared).toBeGreaterThan(0); // full redraw clears first
    expect(drawn.map((d) => d.color)).toEqual(['#ffb6ff', '#ffb6ff', '#ffb6ff']);
  });
});
