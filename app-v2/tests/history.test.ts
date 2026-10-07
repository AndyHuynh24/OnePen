// Undo/redo contract: one user action = one undo step, and undo puts EVERYTHING
// that action touched back (added groups removed, recolored/moved groups restored,
// deleted groups re-inserted in place); redo re-applies it exactly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Group } from '../src/types/group';

vi.mock('../src/persistence/autosave', () => ({ markDirty: () => {}, noteActivity: () => {} }));

const { note } = await import('../src/stores/note.svelte');
const { history } = await import('../src/stores/history.svelte');

function stroke(id: number, color = '#000', x = 0): Group {
  return {
    id,
    type: 'stroke',
    color,
    size: 2,
    stroke: [
      { x, y: 0 },
      { x: x + 10, y: 10 },
    ],
    bbox: { x, y: 0, w: 10, h: 10 },
  } as Group;
}

const colors = () => note.groups.map((g) => `${g.id}:${g.color}`);
const ids = () => note.groups.map((g) => g.id);

/** A pen stroke, like pointer.finishStroke: explicit tx around the add. */
function drawStroke(color = '#000', x = 0) {
  const tx = history.begin({ auto: true });
  note.groups.push(stroke(note.nextId(), color, x));
  note.commit();
  history.commit(tx);
}

beforeEach(() => {
  note.set([], 'test');
  history.clear();
});

describe('history', () => {
  it('undo removes the just-drawn stroke; redo brings it back', () => {
    drawStroke();
    drawStroke();
    expect(ids()).toEqual([1, 2]);
    history.undo();
    expect(ids()).toEqual([1]);
    history.redo();
    expect(ids()).toEqual([1, 2]);
    history.undo();
    history.undo();
    expect(ids()).toEqual([]);
    history.redo();
    history.redo();
    expect(ids()).toEqual([1, 2]);
  });

  it('a box that recolors the enclosed ink undoes as ONE step (box + colors)', () => {
    drawStroke('#000');
    drawStroke('#000');
    // the box gesture: in-place recolor + modifier appended, in one transaction
    const tx = history.begin({ auto: true });
    for (const g of note.groups) g.color = '#f0f';
    note.groups.push({ ...stroke(note.nextId(), '#f0f'), predictedLabel: 'box' } as Group);
    note.commit();
    history.commit(tx);
    expect(colors()).toEqual(['1:#f0f', '2:#f0f', '3:#f0f']);

    history.undo();
    expect(colors()).toEqual(['1:#000', '2:#000']);
    history.redo();
    expect(colors()).toEqual(['1:#f0f', '2:#f0f', '3:#f0f']);
    // undoing it again still restores — the redo didn't leave stale state behind
    history.undo();
    expect(colors()).toEqual(['1:#000', '2:#000']);
  });

  it('an in-place edit is not reverted by undoing a LATER action', () => {
    drawStroke('#000');
    history.capture(); // toolbox recolor
    note.groups[0].color = '#0f0';
    note.commit();
    drawStroke('#000', 50); // closes the recolor step, adds its own
    history.undo(); // undo only the last stroke
    expect(colors()).toEqual(['1:#0f0']);
    history.undo(); // now the recolor
    expect(colors()).toEqual(['1:#000']);
  });

  it('move: undo returns strokes to their previous position', () => {
    drawStroke('#000', 0);
    history.capture();
    const g = note.groups[0];
    g.bbox.x += 100;
    g.stroke = g.stroke!.map((p) => ({ ...p, x: p.x + 100 }));
    note.commit();
    history.undo();
    expect(note.groups[0].bbox.x).toBe(0);
    expect(note.groups[0].stroke![0].x).toBe(0);
    history.redo();
    expect(note.groups[0].bbox.x).toBe(100);
    expect(note.groups[0].stroke![0].x).toBe(100);
  });

  it('erase: undo re-inserts deleted groups at their original z-order', () => {
    drawStroke('#a', 0);
    drawStroke('#b', 10);
    drawStroke('#c', 20);
    history.capture();
    note.groups.splice(0, 2);
    note.commit();
    expect(ids()).toEqual([3]);
    history.undo();
    expect(ids()).toEqual([1, 2, 3]);
  });

  it('concurrent async strokes stay independent (slow classify vs fast stroke)', () => {
    drawStroke('#000', 0);
    // stroke A starts classifying (async) …
    const a = history.begin({ auto: true });
    // … while stroke B is drawn and committed first
    drawStroke('#000', 50);
    // A lands (classify calls history.flush() right after the model await):
    // recolors stroke 1 and adds its box
    history.flush();
    note.groups[0].color = '#f0f';
    note.groups.push(stroke(note.nextId(), '#f0f', 0));
    note.commit();
    history.commit(a);

    // B started after A, so B is the most recent action and undoes first
    history.undo();
    expect(ids()).toEqual([1, 3]);
    expect(colors()).toEqual(['1:#f0f', '3:#f0f']);
    history.undo(); // A: box removed + color restored
    expect(colors()).toEqual(['1:#000']);
  });

  it('undo pressed while a stroke is still classifying waits for it', () => {
    drawStroke('#000', 0);
    const a = history.begin({ auto: true });
    expect(history.undo()).toBe(true); // deferred
    expect(ids()).toEqual([1]);
    note.groups.push(stroke(note.nextId()));
    note.commit();
    history.commit(a); // lands → the deferred undo removes THIS stroke
    expect(ids()).toEqual([1]);
  });

  it('an ended stroke is recorded when the browser goes idle', async () => {
    drawStroke();
    await new Promise((r) => setTimeout(r, 300)); // idle flush ran
    expect(history.canUndo).toBe(true);
    history.undo();
    expect(ids()).toEqual([]);
  });

  it('ids are never reused after undo (redo cannot duplicate an id)', () => {
    drawStroke();
    drawStroke();
    history.undo();
    drawStroke(); // clears redo; must not reuse id 2
    expect(ids()).toEqual([1, 3]);
  });

  it('dropLast cancels a pending toolbox step without touching earlier ones', () => {
    drawStroke();
    history.capture();
    note.groups.push(stroke(note.nextId())); // placeholder gesture stroke
    note.commit();
    note.groups.pop(); // toolbox dismissed → removed again
    note.commit();
    history.dropLast();
    history.undo();
    expect(ids()).toEqual([]);
    expect(history.canUndo).toBe(false);
  });
});
