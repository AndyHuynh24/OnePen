// ─────────────────────────────────────────────────────────────────────────────
// Stroke types — classification labels emitted by the AI model.
// ─────────────────────────────────────────────────────────────────────────────

export const STROKE_TYPE = {
  UNDERLINE: 'underline',
  BOX: 'box',
  CURLY: 'curly',
  DELETE: 'delete',
  SQUAREBRACKET: 'squarebracket',
  WAVYBRACKET: 'wavybracket',
  CIRCLEBRACKET: 'circlebracket',
  HIGHLIGHT: 'highlight',
  MOVE: 'move',
  NONE: 'none',
} as const;

export type StrokeType = (typeof STROKE_TYPE)[keyof typeof STROKE_TYPE];

// Index → label mapping, mirroring the model's output order.
// Length 10 to align with the model's softmax head.
export const CLASSES: readonly StrokeType[] = [
  STROKE_TYPE.UNDERLINE,
  STROKE_TYPE.BOX,
  STROKE_TYPE.CURLY,
  STROKE_TYPE.DELETE,
  STROKE_TYPE.SQUAREBRACKET,
  STROKE_TYPE.WAVYBRACKET,
  STROKE_TYPE.CIRCLEBRACKET,
  STROKE_TYPE.NONE,
  STROKE_TYPE.NONE,
  STROKE_TYPE.NONE,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pen types — what kind of pen produced a stroke (rendering hint, not gesture).
// ─────────────────────────────────────────────────────────────────────────────

export const PEN_TYPES = {
  NORMAL: 'none',
  TITLE: 'title',
  HIGHLIGHTER: 'highlighter',
  BOLD: 'bold',
} as const;

export type PenType = (typeof PEN_TYPES)[keyof typeof PEN_TYPES];

// ─────────────────────────────────────────────────────────────────────────────
// App modes — single source of truth for the current interaction mode.
// Replaces the 12 booleans the original main.js juggled in parallel.
// ─────────────────────────────────────────────────────────────────────────────

export const APP_MODE = {
  IDLE: 'IDLE',
  DRAWING: 'DRAWING',
  ERASING: 'ERASING',
  PANNING: 'PANNING',
  MOVING: 'MOVING',
  SHAPE: 'SHAPE',
  SELECTING: 'SELECTING',
  PASTING: 'PASTING',
  RESIZING_MEDIA: 'RESIZING_MEDIA',
  DRAGGING_MEDIA: 'DRAGGING_MEDIA',
} as const;

export type AppMode = (typeof APP_MODE)[keyof typeof APP_MODE];
