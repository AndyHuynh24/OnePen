import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STROKE_TYPE } from '../src/config/strokeTypes';
import type { Group } from '../src/types/group';

// Stub the model + rasterizer so the gesture path is deterministic: any stroke
// that reaches the classifier is reported as a BOX.
vi.mock('../src/canvas/render/raster', () => ({
  rasterizeStroke: () => ({}) as unknown,
}));
vi.mock('../src/modifiers/predict', () => ({
  predictImageFromCanvas: async () => 'box',
  getLastPredictionData: () => null,
}));

const { classifyStroke } = await import('../src/modifiers/classify');
const { note } = await import('../src/stores/note.svelte');
const { tools } = await import('../src/stores/tools.svelte');

/** A small square stroke ("a written mark") at (x,y). */
function mark(id: number, x: number, y: number): Group {
  const bbox = { x, y, w: 10, h: 10 };
  return {
    id,
    type: 'stroke',
    stroke: [
      { x, y },
      { x: x + 10, y },
      { x: x + 10, y: y + 10 },
      { x, y: y + 10 },
    ],
    bbox,
    color: '#111111',
    size: 2.3,
    visibility: true,
    predictedLabel: STROKE_TYPE.NONE,
  } as Group;
}

/** A big box stroke enclosing everything from (0,0) to (600,400). */
function boxStroke() {
  const pts = [];
  for (let x = 0; x <= 600; x += 10) pts.push({ x, y: 0 });
  for (let y = 0; y <= 400; y += 10) pts.push({ x: 600, y });
  for (let x = 600; x >= 0; x -= 10) pts.push({ x, y: 400 });
  for (let y = 400; y >= 0; y -= 10) pts.push({ x: 0, y });
  return pts;
}

describe('box modifier recoloring', () => {
  beforeEach(() => {
    note.set([], '/test.json');
  });

  it('recolors 3 enclosed marks', async () => {
    const marks = [mark(1, 100, 100), mark(2, 200, 100), mark(3, 300, 100)];
    note.set([...marks], '/test.json');
    await classifyStroke(boxStroke());
    const colors = note.groups.filter((g) => g.id <= 3).map((g) => g.color);
    expect(colors).toEqual([
      tools.modifiers.box.color,
      tools.modifiers.box.color,
      tools.modifiers.box.color,
    ]);
  });

  // Documented threshold (ported from app/main.js): a box that encloses fewer
  // than 3 effective strokes and crosses nothing never reaches the classifier,
  // so it stays a plain pen stroke and recolors nothing.
  it('leaves 2 enclosed marks alone (below the 3-stroke gate)', async () => {
    const marks = [mark(1, 100, 100), mark(2, 200, 100)];
    note.set([...marks], '/test.json');
    await classifyStroke(boxStroke());
    const colors = note.groups.filter((g) => g.id <= 2).map((g) => g.color);
    expect(colors).toEqual(['#111111', '#111111']);
  });

  it('recolors enclosed finalized text (per-char groups)', async () => {
    const chars: Group[] = [];
    for (let i = 0; i < 5; i++) {
      const b = { x: 100 + i * 15, y: 100, w: 12, h: 24 };
      chars.push({
        id: i + 1,
        type: 'text',
        isChar: true,
        textGroupId: 'tg_1',
        text: 'hello'[i],
        bbox: b,
        stroke: [
          { x: b.x, y: b.y },
          { x: b.x + b.w, y: b.y },
          { x: b.x + b.w, y: b.y + b.h },
          { x: b.x, y: b.y + b.h },
        ],
        color: '#111111',
        size: 1,
        visibility: true,
        fontSize: 24,
      } as unknown as Group);
    }
    note.set(chars, '/test.json');
    await classifyStroke(boxStroke());
    const colors = note.groups.filter((g) => g.id <= 5).map((g) => g.color);
    expect(colors).toEqual(Array(5).fill(tools.modifiers.box.color));
  });

  it('recolors an enclosed text block', async () => {
    const b = { x: 100, y: 100, w: 120, h: 40 };
    const text = {
      id: 1,
      type: 'text',
      text: 'hello',
      bbox: b,
      stroke: [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ],
      fakeStrokes: [
        [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }],
        [{ x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }],
        [{ x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }],
      ],
      color: '#111111',
      size: 1,
      visibility: true,
      fontSize: 24,
    } as unknown as Group;
    note.set([text], '/test.json');
    await classifyStroke(boxStroke());
    expect(note.groups[0].color).toBe(tools.modifiers.box.color);
  });
});
