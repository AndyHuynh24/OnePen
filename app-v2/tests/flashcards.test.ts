import { describe, it, expect } from 'vitest';
import { extractFlashcards } from '$lib/flashcards';
import { tools } from '$stores/tools.svelte';
import type { Group } from '$types/group';

const boxColor = tools.modifiers.box.color;

function ink(id: number, x: number, y: number): Group {
  const stroke = [
    { x, y },
    { x: x + 10, y: y + 5 },
  ];
  return { id, stroke, bbox: { x, y, w: 10, h: 5 }, color: boxColor, size: 2, type: 'stroke' };
}

describe('flashcards', () => {
  // a box around three strokes; a tape covers the third one
  const box: Group = {
    id: 10,
    type: 'stroke',
    predictedLabel: 'box',
    color: boxColor,
    size: 2,
    stroke: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ],
    bbox: { x: 0, y: 0, w: 200, h: 100 },
  };
  const tape: Group = {
    id: 20,
    type: 'tape',
    color: '#000',
    size: 1,
    stroke: [{ x: 120, y: 40 }],
    bbox: { x: 120, y: 40, w: 10, h: 5 },
    coveredGroupIds: [3],
  };
  const content = [ink(1, 20, 40), ink(2, 60, 40), ink(3, 120, 40), box, tape];

  it('the taped strokes are the answer, the rest of the group is the question', () => {
    const cards = extractFlashcards('Bio/Cells.json', content);
    expect(cards).toHaveLength(1);
    expect(cards[0].answer).toHaveLength(1);
    expect(cards[0].answer[0].points[0].x).toBe(120);
    expect(cards[0].question.map((s) => s.points[0].x).sort((a, b) => a - b)).toEqual([20, 60]);
  });

  it('no card when the tape covers nothing in the group', () => {
    const elsewhere = { ...tape, coveredGroupIds: [999] };
    expect(extractFlashcards('Bio/Cells.json', [...content.slice(0, 4), elsewhere])).toHaveLength(0);
  });
});
