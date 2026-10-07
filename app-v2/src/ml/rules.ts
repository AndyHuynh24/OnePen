// ─────────────────────────────────────────────────────────────────────────────
// Gesture feedback rules — turn what the user did AFTER a prediction into a
// best-guess true label + how much to trust it.
//
// Pure function of the recorded facts, so the exact same rules can be re-run
// offline on exported logs when they're tuned (the raw signals are logged too).
//
//   R1  undone, then a similar stroke kept      → the redraw's result     0.85
//   R2  undone, no similar redraw               → probably none           0.3, review
//   R3  erased (instead of undone)              → as R1 / R2
//   R4  a delete gesture reversed               → as R1 / R2, ALWAYS review
//   R5  toolbox dismissed, similar stroke held  → that toolbox's kind     0.9
//       again and a tool picked
//   R6  predicted none, undone/erased, then a   → that gesture            0.85
//       similar stroke recognized as a gesture
//   R7  nothing negative happened               → the prediction          0.6 (none: 0.5)
// (R8 "style reverted" needs color tracking — not implemented yet.)
// ─────────────────────────────────────────────────────────────────────────────

import { isSimilar, type StrokeShape } from './similarity';

export const WINDOWS = {
  NEGATIVE_MS: 15_000, // undo/erase must come within this of the gesture …
  NEGATIVE_MAX_ACTIONS: 3, // … and before this many other strokes
  REDRAW_MS: 20_000, // the redraw must come within this of the undo/erase
  REHOLD_MS: 10_000, // re-hold after a dismissed toolbox
  FINALIZE_MS: 40_000, // when a gesture's outcome is resolved
  REVIEW_SAMPLE: 0.02, // share of kept `none` predictions sent to review anyway
};

export type Signal =
  | { kind: 'undone'; ts: number }
  | { kind: 'redone'; ts: number }
  | { kind: 'erased'; ts: number }
  | { kind: 'toolboxSelected'; ts: number; toolbox: string; tool: string }
  | { kind: 'toolboxDismissed'; ts: number; toolbox: string };

export interface GestureFacts {
  ts: number;
  hold: boolean;
  /** the model's final label ('none' if nothing cleared a threshold) */
  predicted: string;
  shape: StrokeShape;
  signals: Signal[];
}

/** A stroke finished after the gesture (any stroke, model or not). */
export interface LaterStroke {
  ts: number;
  shape: StrokeShape;
  hold: boolean;
  /** what it ended up as: its predicted gesture, or 'none' for plain ink */
  label: string;
  /** for a hold: the toolbox a tool was picked from (null = dismissed / none) */
  toolboxSelected: string | null;
  /** it was itself undone or erased (so it's not a trustworthy redraw) */
  reverted: boolean;
}

export interface Resolution {
  /** best-guess true label; null = no usable label (drop from training) */
  label: string | null;
  trust: number;
  rule: string;
  review: boolean;
}

/** Toolbox kind → model label. Bracket toolboxes may be synced to one kind, so
 *  a bracket toolbox confirms whichever bracket the model predicted. */
export function labelForToolbox(toolbox: string, predicted: string): string {
  const BRACKETS = ['squarebracket', 'wavybracket', 'circlebracket'];
  if (toolbox === 'press') return 'none';
  const lower = toolbox.toLowerCase();
  if (BRACKETS.includes(lower)) return BRACKETS.includes(predicted) ? predicted : lower;
  return lower;
}

export function resolveGesture(g: GestureFacts, later: LaterStroke[], rand = Math.random()): Resolution {
  const after = later.filter((s) => s.ts > g.ts).sort((a, b) => a.ts - b.ts);

  // ── hold → toolbox ───────────────────────────────────────────────────────────
  if (g.hold) {
    const sel = g.signals.find((s) => s.kind === 'toolboxSelected');
    if (sel && sel.kind === 'toolboxSelected') {
      return { label: labelForToolbox(sel.toolbox, g.predicted), trust: 0.9, rule: 'R5-selected', review: false };
    }
    const dis = g.signals.find((s) => s.kind === 'toolboxDismissed');
    if (dis) {
      const rehold = after.find(
        (s) =>
          s.hold &&
          s.toolboxSelected !== null &&
          s.ts - dis.ts <= WINDOWS.REHOLD_MS &&
          isSimilar(g.shape, s.shape),
      );
      if (rehold && rehold.toolboxSelected) {
        const label = labelForToolbox(rehold.toolboxSelected, g.predicted);
        return label !== g.predicted
          ? { label, trust: 0.9, rule: 'R5', review: false }
          : { label, trust: 0.7, rule: 'R5-same', review: false };
      }
    }
    return { label: null, trust: 0, rule: 'hold-no-choice', review: false };
  }

  // ── auto-applied (or kept as ink) ───────────────────────────────────────────
  const negative = g.signals.find((s) => {
    if (s.kind !== 'undone' && s.kind !== 'erased') return false;
    if (s.ts - g.ts > WINDOWS.NEGATIVE_MS) return false;
    const actionsBefore = after.filter((l) => l.ts < s.ts).length;
    return actionsBefore <= WINDOWS.NEGATIVE_MAX_ACTIONS;
  });

  if (!negative) {
    const isNone = g.predicted === 'none';
    return {
      label: g.predicted,
      trust: isNone ? 0.5 : 0.6,
      rule: 'R7',
      review: isNone && rand < WINDOWS.REVIEW_SAMPLE,
    };
  }

  // undone, then redone → the user changed their mind; the prediction stood
  if (g.signals.some((s) => s.kind === 'redone' && s.ts > negative.ts)) {
    return { label: g.predicted, trust: 0.6, rule: 'R7-redone', review: false };
  }

  const erased = negative.kind === 'erased';
  const isDelete = g.predicted === 'delete';
  const redraw = after.find(
    (s) =>
      !s.hold &&
      !s.reverted &&
      s.ts > negative.ts &&
      s.ts - negative.ts <= WINDOWS.REDRAW_MS &&
      isSimilar(g.shape, s.shape),
  );

  if (redraw) {
    if (redraw.label !== g.predicted) {
      const rule = g.predicted === 'none' ? 'R6' : erased ? 'R3' : 'R1';
      return { label: redraw.label, trust: 0.85, rule, review: isDelete };
    }
    // redrew the same thing and it came out the same → the label was probably
    // right but it covered the wrong content; worth a look, weak label
    return { label: g.predicted, trust: 0.5, rule: 'R1-same', review: true };
  }

  if (g.predicted === 'none') {
    // removed their own plain ink without redrawing — not a recognition signal
    return { label: null, trust: 0, rule: 'ink-removed', review: false };
  }
  return { label: 'none', trust: 0.3, rule: erased ? 'R3-noredraw' : 'R2', review: true };
}
