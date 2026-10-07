// ─────────────────────────────────────────────────────────────────────────────
// Group — the atom of the canvas. A pen stroke, a shape, text, media, sticky
// note, tape cover, embed link, math result, summary nav, or reminder anchor.
// All renderable content on the canvas is a Group.
// ─────────────────────────────────────────────────────────────────────────────

import type { BBox, Stroke } from './geometry';
import type { PenType, StrokeType } from '$config/strokeTypes';

export type GroupType =
  | 'stroke'
  | 'highlight'
  | 'text'
  | 'media'
  | 'stickynote'
  | 'link'
  | 'tape'
  | 'summary_nav'
  | 'math_result';

export type MediaKind = 'image' | 'pdf';
export type ShapeKind = 0 | 1 | 2; // 0 = line, 1 = rect, 2 = circle
export type TextAlign = 'left' | 'center' | 'right';

export interface TextBlock {
  text: string;
  bbox: BBox;
  fontSize: number;
  fontFamily: string;
  color: string;
  opacity: number;
}

export interface BaseGroup {
  /** unique id within the note */
  id: number;
  /** raw stroke points (always at least 1 entry, even for non-stroke types) */
  stroke: Stroke;
  /** bounding box in world coordinates */
  bbox: BBox;
  /** primary color (hex or rgba) */
  color: string;
  /** line width in world pixels */
  size: number;

  type?: GroupType;
  visibility?: boolean;
  /** AI label, pen type, or numeric class index. Loosely typed because the
   *  original stores any of these in the same field. */
  predictedLabel?: StrokeType | PenType | number;

  // title / heading
  titleStatus?: boolean;
  titleLevel?: 1 | 2 | 3;
  titleGroupId?: string;

  // reminder
  reminderStatus?: boolean;
  reminderDate?: string;
  reminderGroupId?: string;

  // tape (flashcard cover)
  revealed?: boolean;
  fadeProgress?: number;
  preset?: string;
  /** text covered by the tape, used for flashcard review */
  textBlocks?: TextBlock[];
  /** ids of the strokes this annotation (tape/link/sticky) was applied to */
  coveredGroupIds?: number[];

  // shapes (for line / rect / circle drawing)
  shape?: ShapeKind;
  directX?: 1 | -1;
  directY?: 1 | -1;

  // media (image / PDF)
  mediaType?: MediaKind;
  /** base64 / object-URL of the rendered image (or PDF page) */
  dataUrl?: string;
  originalWidth?: number;
  originalHeight?: number;
  /** non-destructive crop: source rectangle, normalized 0..1 of the image */
  crop?: { sx: number; sy: number; sw: number; sh: number };
  rotation?: number;
  opacity?: number;
  aspectLocked?: boolean;
  zIndex?: number;
  // pdf-only
  pdfPage?: number;
  pdfTotalPages?: number;
  pdfBase64?: string;
  /** links pages of one PDF so they can move together */
  pdfGroupId?: string;

  // link / embed
  url?: string;
  /** attached file as a data URL (image / PDF / etc.) for the embed window */
  fileData?: string;
  fileName?: string;
  fileType?: string;

  // sticky note
  /** strokes drawn inside the sticky-note mini-canvas */
  noteStrokes?: Stroke[];
  noteText?: string;

  // text block / math result
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  textAlign?: TextAlign;
  /** math result: the LaTeX/equation the OCR read (shown in the verify popup) */
  mathLatex?: string;
  /** math result: bbox of the source equation strokes (for re-positioning) */
  mathSourceBBox?: BBox;
  /** math result: the exact answer (e.g. "1/3") kept so the decimal toggle can
   *  switch back from the rounded decimal form */
  mathExact?: string;
  /** math result: true while showing the rounded-decimal form of a fraction */
  mathDecimal?: boolean;
  /** fake edge strokes so modifiers (box/curly) can wrap a text block */
  fakeStrokes?: Stroke[];
  /** a single typed character behaving like a stroke (bbox = glyph cell) */
  isChar?: boolean;
  /** links character-strokes from the same text so actions apply by majority */
  textGroupId?: string;

  // summary nav button
  sourceNotePath?: string;
  sourceViewport?: { x: number; y: number };
  sourceDate?: string;
}

export type Group = BaseGroup;

// ─────────────────────────────────────────────────────────────────────────────
// Modifier — settings (color, size, visibility) for each modifier kind.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierConfig {
  color: string;
  size: number;
  visibility: boolean;
}

// Mirrors DEFAULT_MODIFIERS in the original app/config — the classifier indexes
// `modifiers[predictedLabel]` with the AI label names below.
export type ModifierKey =
  | 'defaultPen'
  | 'box'
  | 'curly'
  | 'squarebracket'
  | 'wavybracket'
  | 'circlebracket';
