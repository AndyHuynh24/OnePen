// ─────────────────────────────────────────────────────────────────────────────
// Flashcard extraction — faithful port of extractFlashcardsFromNote in main.js.
//
// A "group" is the set of strokes that were SELECTED + STYLED TOGETHER by a
// box / curly / bracket modifier — detected here exactly as the original does:
//   • the strokes were recolored to the modifier's color (color match), AND
//   • box/curly: the stroke lies INSIDE the modifier polygon (isInside)
//     brackets:  the stroke lies within the modifier's vertical Y-bounds
// When a TAPE covers part of such a group, that's a flashcard:
//   • answer   = the group's strokes that the tape covers (revealed on flip)
//   • question = the rest of the group (shown on the front)
// Front = question. Back = whole group (question + answer revealed in place).
//
// Brackets are processed last and newest-first; a "claimed" set stops one stroke
// being counted in two cards.
// ─────────────────────────────────────────────────────────────────────────────

import { listNotesInFolder, loadNote, nameOf } from '$persistence/notes';
import { note } from '$stores/note.svelte';
import { tools } from '$stores/tools.svelte';
import { isInside } from '$canvas/hitTest';
import { normalizeColor } from '$lib/color';
import { STROKE_TYPE } from '$config/strokeTypes';
import type { Group } from '$types/group';
import type { BBox } from '$types/geometry';

export interface CardStroke {
  points: { x: number; y: number }[];
  color: string;
  size: number;
}

export interface Flashcard {
  id: string;
  notePath: string;
  noteName: string;
  question: CardStroke[];
  answer: CardStroke[];
  bbox: BBox;
}

// predictedLabel can be a string label OR a legacy numeric class index — accept both.
const LABEL_INDEX: Record<string, number> = {
  [STROKE_TYPE.BOX]: 1,
  [STROKE_TYPE.CURLY]: 2,
  [STROKE_TYPE.SQUAREBRACKET]: 4,
  [STROKE_TYPE.WAVYBRACKET]: 5,
  [STROKE_TYPE.CIRCLEBRACKET]: 6,
};
function isLabel(g: Group, label: keyof typeof LABEL_INDEX): boolean {
  return g.predictedLabel === label || g.predictedLabel === LABEL_INDEX[label];
}

function modifierColor(key: 'box' | 'curly' | 'squarebracket' | 'wavybracket' | 'circlebracket'): string {
  return normalizeColor(tools.modifiers[key]?.color);
}

function toCardStroke(g: Group): CardStroke {
  return {
    points: (g.stroke ?? []).map((p) => ({ x: p.x, y: p.y })),
    color: g.color || '#888',
    size: g.size || 2,
  };
}

function unionBBox(groups: Group[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of groups) {
    if (!g.bbox) continue;
    minX = Math.min(minX, g.bbox.x);
    minY = Math.min(minY, g.bbox.y);
    maxX = Math.max(maxX, g.bbox.x + g.bbox.w);
    maxY = Math.max(maxY, g.bbox.y + g.bbox.h);
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Build a flashcard from a matched group: the TAPED strokes are the answer
 *  (hidden until the flip), the rest of the group is the question (front). */
function makeCard(
  notePath: string,
  noteName: string,
  tapeId: number,
  group: Group[],
  coveredIds: Set<number>,
): Flashcard | null {
  const answer = group.filter((g) => coveredIds.has(g.id));
  const question = group.filter((g) => !coveredIds.has(g.id));
  if (answer.length === 0) return null;
  return {
    id: `fc_${tapeId}`,
    notePath,
    noteName,
    question: question.map(toCardStroke),
    answer: answer.map(toCardStroke),
    bbox: unionBBox(group),
  };
}

/** Extract flashcards from a single note's content. */
export function extractFlashcards(notePath: string, content: Group[]): Flashcard[] {
  const cards: Flashcard[] = [];
  const noteName = nameOf(notePath).replace(/\.json$/, '');
  const claimed = new Set<number>();

  // ── tapes → keyword (answer) strokes ──────────────────────────────────────
  const tapes = content.filter((g) => g.type === 'tape' && g.visibility !== false);
  if (tapes.length === 0) return cards;
  // newest tape first (higher id)
  tapes.sort((a, b) => (b.id || 0) - (a.id || 0));

  // tapeId → the set of stroke-ids it covers
  const keywordIdsByTape = new Map<number, Set<number>>();
  for (const tape of tapes) {
    keywordIdsByTape.set(tape.id, new Set(tape.coveredGroupIds ?? []));
  }

  // find which tape (if any) this group's strokes belong to (group ∩ tape-covered)
  const matchTape = (group: Group[]): { tapeId: number; coveredIds: Set<number> } | null => {
    for (const [tapeId, ids] of keywordIdsByTape) {
      if (group.some((g) => ids.has(g.id))) return { tapeId, coveredIds: ids };
    }
    return null;
  };

  // ── box: strokes INSIDE the box polygon AND recolored to the box color ─────
  const boxColor = modifierColor('box');
  for (const mod of content) {
    if (mod.visibility === false || !mod.bbox || !Array.isArray(mod.stroke)) continue;
    if (!isLabel(mod, STROKE_TYPE.BOX)) continue;
    const children = content.filter(
      (o) =>
        o.id !== mod.id &&
        o.bbox &&
        Array.isArray(o.stroke) &&
        o.visibility !== false &&
        !claimed.has(o.id) &&
        normalizeColor(o.color) === boxColor &&
        isInside(o.stroke, mod.stroke!),
    );
    if (children.length === 0) continue;
    const m = matchTape(children);
    if (!m) continue;
    children.forEach((c) => claimed.add(c.id));
    const card = makeCard(notePath, noteName, m.tapeId, children, m.coveredIds);
    if (card) cards.push(card);
  }

  // ── curly: same, with the curly color ──────────────────────────────────────
  const curlyColor = modifierColor('curly');
  for (const mod of content) {
    if (mod.visibility === false || !mod.bbox || !Array.isArray(mod.stroke)) continue;
    if (!isLabel(mod, STROKE_TYPE.CURLY)) continue;
    const children = content.filter(
      (o) =>
        o.id !== mod.id &&
        o.bbox &&
        Array.isArray(o.stroke) &&
        o.visibility !== false &&
        !claimed.has(o.id) &&
        normalizeColor(o.color) === curlyColor &&
        isInside(o.stroke, mod.stroke!),
    );
    if (children.length === 0) continue;
    const m = matchTape(children);
    if (!m) continue;
    children.forEach((c) => claimed.add(c.id));
    const card = makeCard(notePath, noteName, m.tapeId, children, m.coveredIds);
    if (card) cards.push(card);
  }

  // ── brackets: strokes within the bracket's Y-bounds AND its color. Bracket
  //    modifiers are invisible, so we don't gate on visibility here. Collect
  //    all, then claim newest-first so a stroke isn't double-counted. ──────────
  const bracketKeys = ['squarebracket', 'wavybracket', 'circlebracket'] as const;
  interface Pending {
    order: number;
    children: Group[];
    match: { tapeId: number; coveredIds: Set<number> };
  }
  const pending: Pending[] = [];

  for (const key of bracketKeys) {
    const color = modifierColor(key);
    content.forEach((mod, order) => {
      if (!mod.bbox || !Array.isArray(mod.stroke)) return;
      if (!isLabel(mod, key)) return;
      const box = mod.bbox;
      const children = content.filter(
        (o) =>
          o.id !== mod.id &&
          o.bbox &&
          Array.isArray(o.stroke) &&
          o.visibility !== false &&
          o.bbox.y > box.y &&
          o.bbox.y + o.bbox.h < box.y + box.h &&
          normalizeColor(o.color) === color,
      );
      if (children.length === 0) return;
      const m = matchTape(children);
      if (m) pending.push({ order, children, match: m });
    });
  }

  // newest bracket claims strokes first
  pending.sort((a, b) => b.order - a.order);
  for (const p of pending) {
    const unclaimed = p.children.filter((c) => !claimed.has(c.id));
    if (unclaimed.length === 0) continue;
    unclaimed.forEach((c) => claimed.add(c.id));
    const card = makeCard(notePath, noteName, p.match.tapeId, unclaimed, p.match.coveredIds);
    if (card) cards.push(card);
  }

  return cards;
}

/** Scan every note in a folder for flashcards (open note read live). */
export async function scanFolderForFlashcards(folder: string): Promise<Flashcard[]> {
  const notes = await listNotesInFolder(folder);
  const out: Flashcard[] = [];
  for (const n of notes) {
    const content = n.path === note.path ? note.groups : ((await loadNote(n.path))?.content ?? []);
    out.push(...extractFlashcards(n.path, content as Group[]));
  }
  return out;
}
