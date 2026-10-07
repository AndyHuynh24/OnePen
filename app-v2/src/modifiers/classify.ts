// ─────────────────────────────────────────────────────────────────────────────
// classifyStroke — decides what a completed stroke is and applies it.
// Faithful port of classifyStroke() in app/main.js, adapted to the store-based
// architecture. Detects normal strokes vs. AI gestures (box / curly / underline
// / brackets / delete), recolors enclosed content, removes deleted content, and
// reports a toolbox intent for the hold gesture (wired in Phase 6).
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { Point } from '$types/geometry';
import { CONFIG } from '$config/constants';
import { PEN_TYPES, STROKE_TYPE, type StrokeType } from '$config/strokeTypes';
import type { ModifierKey } from '$types/group';
import type { ToolboxKind } from '$config/tools';
import { note } from '$stores/note.svelte';
import { history } from '$stores/history.svelte';
import { tools } from '$stores/tools.svelte';
import { viewport } from '$stores/viewport.svelte';
import {
  getBoundingBox,
  intersectBBox,
  isInside,
  isSBoxInLBox,
  strokesIntersect,
} from '$canvas/hitTest';
import { rasterizeStroke } from '$canvas/render/raster';
import { getEngine } from '$canvas/engineRef';
import { predictImageFromCanvas, getLastPredictionData, type PredictionData } from './predict';
import { resolveCharGroupAction } from './charGroup';

const SHORTCUT_LABELS: StrokeType[] = [
  STROKE_TYPE.SQUAREBRACKET,
  STROKE_TYPE.WAVYBRACKET,
  STROKE_TYPE.CIRCLEBRACKET,
];

function isShortcut(label: StrokeType): boolean {
  return SHORTCUT_LABELS.includes(label);
}

function isColorProtected(group: Group): boolean {
  const t = group.type as string | undefined;
  const isHighlight =
    group.predictedLabel === STROKE_TYPE.HIGHLIGHT ||
    group.predictedLabel === PEN_TYPES.HIGHLIGHTER ||
    t === 'highlight';
  return isHighlight || t === 'stickynote' || t === 'tape';
}

export type ToolboxIntent = ToolboxKind | 'press' | null;

export interface ClassifyResult {
  predictedLabel: StrokeType;
  modifier: Group | null;
  modifiedGroups: Group[];
  toolboxIntent: ToolboxIntent;
  /** the model's full output — null when the stroke never reached the model */
  prediction: PredictionData | null;
  /** what the gesture covered when it was classified (for the feedback log) */
  context: { enclosedCount: number; intersectCount: number };
}

export async function classifyStroke(
  stroke: Point[],
  opts: { hold?: boolean } = {},
): Promise<ClassifyResult> {
  const hold = opts.hold ?? false;
  // NB: re-read after the model await below — a stroke committed meanwhile
  // replaces note.groups, and pushing into the stale array would lose this one.
  let groups = note.groups;
  const screenBox = viewport.screen;
  const normalHeight = CONFIG.NORMAL_HEIGHT;
  const penColor = tools.penColor;
  const penSize = tools.penSize;
  const penType = tools.penType;

  let modifiedGroups: Group[] = [];
  const intersectGroups: Group[] = [];
  let intersectPointsCount = 0;
  let shownModifier = true;
  let predictedLabel: StrokeType = STROKE_TYPE.NONE;

  const newBox = getBoundingBox(stroke);
  let maxY = 100000;
  let minY = newBox.y + newBox.h - normalHeight * 0.55;
  const wideEnough =
    newBox.w > CONFIG.WIDE_ENOUGH_WIDTH || newBox.h > CONFIG.WIDE_ENOUGH_HEIGHT;

  // ── normal stroke (too small to be a gesture, or AI off) ────────────────
  if (!wideEnough || !tools.aiOn) {
    const modifier: Group = {
      id: note.nextId(),
      stroke,
      bbox: newBox,
      color: penColor,
      predictedLabel: penType,
      visibility: shownModifier,
      size: penSize,
      type: 'stroke',
    };
    groups.push(modifier);
    note.commit();
    // A hold on a too-small stroke opens the "press" toolbox (quick tools).
    return {
      predictedLabel,
      modifier,
      modifiedGroups: [modifier],
      toolboxIntent: hold ? 'press' : null,
      prediction: null,
      context: { enclosedCount: 0, intersectCount: 0 },
    };
  }

  // ── gesture path: gather intersecting + enclosed groups ─────────────────
  for (const group of groups) {
    if (group.visibility === false || !group.bbox || !intersectBBox(group.bbox, screenBox) || !group.stroke)
      continue;

    if (group.predictedLabel !== STROKE_TYPE.DELETE) {
      const box = group.bbox;
      if (intersectBBox(newBox, box)) {
        intersectPointsCount += strokesIntersect(stroke, group.stroke);
        if (intersectPointsCount > 0) intersectGroups.push(group);
      }

      let isGroupInside = false;
      if (group.type === 'text') {
        const corners: Point[] = [
          { x: box.x, y: box.y },
          { x: box.x + box.w, y: box.y },
          { x: box.x + box.w, y: box.y + box.h },
          { x: box.x, y: box.y + box.h },
        ];
        isGroupInside = isInside(corners, stroke);
      } else {
        isGroupInside = isInside(group.stroke, stroke);
      }

      if (isGroupInside) {
        modifiedGroups.push(group);
      } else {
        if (maxY >= minY - normalHeight * 0.55) maxY = Math.min(minY - 7, newBox.y);
        const withinBand = box.y + box.h > maxY;
        const approxAboveLine =
          Math.abs(box.y + box.h - newBox.y - newBox.h) < normalHeight * 0.7;
        const overlapsX = box.x + box.w > newBox.x && box.x < newBox.x + newBox.w;
        if (withinBand && approxAboveLine && overlapsX) {
          maxY = Math.min(maxY, box.y, newBox.y);
          minY = Math.max(minY, box.y + box.h, newBox.y + newBox.h);
        }
      }
    }
  }

  // pull in groups within the underline band, if appropriate
  const continueCheck = modifiedGroups.length <= 2 || intersectGroups.length >= 2;
  if (continueCheck) {
    const band = {
      x: newBox.x - 14,
      y: maxY - 8,
      w: newBox.w + 14,
      h: minY - maxY + 18,
    };
    for (const group of groups) {
      if (group.visibility === false || !group.bbox || !intersectBBox(group.bbox, screenBox))
        continue;
      if (isSBoxInLBox(group.bbox, band) && !modifiedGroups.some((g) => g.bbox === group.bbox)) {
        modifiedGroups.push(group);
      }
    }
  }

  // An un-decomposed text block counts as its fakeStrokes (3), matching the
  // original — otherwise boxing a lone text block never reaches the classifier.
  // Finalized text is per-character groups, which already count 1 each.
  let effectiveStrokeCount = 0;
  for (const g of modifiedGroups) {
    effectiveStrokeCount += g.type === 'text' && g.fakeStrokes ? g.fakeStrokes.length : 1;
  }

  let appliedColor = penColor;
  let prediction: PredictionData | null = null;

  if (effectiveStrokeCount >= 3 || intersectPointsCount >= 4) {
    const raster = rasterizeStroke(stroke, 96);
    if (raster) {
      const before = getLastPredictionData();
      predictedLabel = await predictImageFromCanvas(stroke, raster);
      const after = getLastPredictionData();
      if (after !== before) prediction = after; // the model actually ran
      groups = note.groups;
      // a stroke that ended while the model ran must be recorded before this
      // one edits the note (keeps each stroke its own undo step)
      history.flush();
    }

    if (
      predictedLabel === STROKE_TYPE.UNDERLINE ||
      predictedLabel === STROKE_TYPE.NONE ||
      predictedLabel === STROKE_TYPE.DELETE
    ) {
      appliedColor = penColor;
      shownModifier = true;
    } else {
      const mod = tools.modifiers[predictedLabel as ModifierKey];
      appliedColor = mod?.color || penColor;
      shownModifier = mod?.visibility ?? true;
    }

    if (predictedLabel === STROKE_TYPE.DELETE) {
      for (const group of intersectGroups) {
        if (!modifiedGroups.some((g) => g.stroke === group.stroke)) modifiedGroups.push(group);
      }
    } else if (isShortcut(predictedLabel)) {
      modifiedGroups = [];
      for (const group of groups) {
        if (group.visibility === false || !group.bbox || !intersectBBox(group.bbox, screenBox))
          continue;
        const inside =
          group.bbox.y > newBox.y && group.bbox.y + group.bbox.h < newBox.y + newBox.h;
        if (inside) modifiedGroups.push(group);
      }
    }
  }

  // On the auto-apply path (no hold) the box/curly/bracket stroke takes the
  // modifier color so the drawn shape matches the content it styles. On a HOLD
  // (toolbox) the stroke keeps the pen color — it only recolors once the chosen
  // tool actually applies one. Other strokes always stay pen-colored.
  const isStylingLabel =
    predictedLabel === STROKE_TYPE.BOX ||
    predictedLabel === STROKE_TYPE.CURLY ||
    isShortcut(predictedLabel);

  // create the modifier group
  const modifier: Group = {
    id: note.nextId(),
    stroke,
    bbox: newBox,
    color: isStylingLabel && !hold ? appliedColor : penColor,
    predictedLabel,
    visibility: shownModifier,
    size: penSize,
    type: 'stroke',
  };

  if (predictedLabel !== STROKE_TYPE.DELETE) {
    groups.push(modifier);
    modifiedGroups.push(modifier);
  } else {
    modifiedGroups = [];
    for (const group of groups) {
      if (group.visibility === false || !group.bbox || !intersectBBox(group.bbox, screenBox))
        continue;
      if (isSBoxInLBox(group.bbox, newBox) || intersectBBox(group.bbox, newBox)) {
        modifiedGroups.push(group);
      }
    }
  }

  // apply the action (unless this is a hold preview — Phase 6 opens a toolbox)
  let mutatedInPlace = false;
  if (!hold) {
    // text reacts as a whole word: a majority of its character-strokes must be
    // hit for the action to apply (and then it applies to all of them).
    const targets = resolveCharGroupAction(modifiedGroups, groups);
    for (const group of targets) {
      if (
        predictedLabel === STROKE_TYPE.DELETE &&
        group.type !== 'media' &&
        penType !== PEN_TYPES.HIGHLIGHTER
      ) {
        const i = groups.indexOf(group);
        if (i !== -1) groups.splice(i, 1);
      } else if (
        predictedLabel === STROKE_TYPE.BOX ||
        predictedLabel === STROKE_TYPE.CURLY ||
        isShortcut(predictedLabel)
      ) {
        if (!isColorProtected(group) && group.id !== modifier.id) {
          group.color = appliedColor;
          group.size = tools.modifiers[predictedLabel as ModifierKey]?.size ?? group.size;
          mutatedInPlace = true;
        }
      }
    }
  }

  note.commit();

  // Recoloring edits groups IN PLACE while the modifier stroke is appended — the
  // engine's incremental append path compares object identity, so without this it
  // would paint only the new box and leave the recolored ink at its old color
  // until something else forced a full redraw (e.g. a scroll).
  if (mutatedInPlace) getEngine()?.invalidateDrawFull();

  return {
    predictedLabel,
    modifier,
    modifiedGroups,
    toolboxIntent: hold ? toolboxIntentFor(predictedLabel) : null,
    prediction,
    context: { enclosedCount: effectiveStrokeCount, intersectCount: intersectPointsCount },
  };
}

function toolboxIntentFor(label: StrokeType): ToolboxIntent {
  if (label === STROKE_TYPE.NONE) return 'press';
  if (label === STROKE_TYPE.CURLY) return 'curly';
  if (label === STROKE_TYPE.BOX) return 'box';
  if (label === STROKE_TYPE.UNDERLINE) return 'underline';
  if (isShortcut(label)) {
    if (tools.syncBracketToolboxes) return 'squareBracket';
    if (label === STROKE_TYPE.WAVYBRACKET) return 'wavyBracket';
    if (label === STROKE_TYPE.CIRCLEBRACKET) return 'circleBracket';
    return 'squareBracket';
  }
  return null;
}
