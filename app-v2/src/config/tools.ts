// ─────────────────────────────────────────────────────────────────────────────
// Tool identifiers + registry + per-toolbox layout selections.
// Ported from app/config.js — TOOL_ID, TOOL_REGISTRY, TOOLBOX_SELECTION.
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_ID = {
  ERASER: 'eraser',
  PEN: 'pen',
  TITLE1: 'title1',
  TITLE2: 'title2',
  TITLE3: 'title3',
  HIGHLIGHT: 'highlight',
  DELETE: 'delete',
  MOVE: 'move',
  BOLD_DEFAULT: 'bold',
  BOLD_CUSTOM: 'bold_custom',
  COPY: 'copy',
  PASTE: 'paste',
  STICKY: 'stickynote',
  LINK: 'link',
  MATH: 'mathSolver',
  MEDIA: 'media',
  TAPE: 'tape',
  REMINDER: 'reminder',
  CUSTOM_COLOR: 'customColor',
  DEFAULT_PEN: 'defaultPen',
} as const;

export type ToolId = (typeof TOOL_ID)[keyof typeof TOOL_ID];

export interface ToolDescriptor {
  icon: string;
  color?: string;
  colorCustomizable: boolean;
  sizeCustomizable: boolean;
  visibilityCustomizable: boolean;
  tapePresetCustomizable?: boolean;
  defaultSize?: number;
  contextual?: boolean;
}

export const TOOL_REGISTRY: Readonly<Record<ToolId, ToolDescriptor>> = {
  eraser: {
    icon: 'bx-eraser',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  pen: {
    icon: 'bx-pen',
    colorCustomizable: true,
    sizeCustomizable: true,
    visibilityCustomizable: true,
  },
  title1: {
    icon: 'bx-heading',
    colorCustomizable: true,
    sizeCustomizable: true,
    visibilityCustomizable: true,
  },
  title2: {
    icon: 'bx-heading',
    colorCustomizable: true,
    sizeCustomizable: true,
    visibilityCustomizable: true,
  },
  title3: {
    icon: 'bx-heading',
    colorCustomizable: true,
    sizeCustomizable: true,
    visibilityCustomizable: true,
  },
  highlight: {
    icon: 'bx-highlight',
    colorCustomizable: true,
    sizeCustomizable: false,
    visibilityCustomizable: false,
    defaultSize: 30,
  },
  bold: {
    icon: 'bx-bold',
    color: 'red',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  bold_custom: {
    icon: 'bx-bold',
    color: 'white',
    colorCustomizable: true,
    sizeCustomizable: false,
    visibilityCustomizable: true,
  },
  delete: {
    icon: 'bx-trash',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  move: {
    icon: 'bx-move',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  mathSolver: {
    icon: 'bx-calculator',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  copy: {
    icon: 'bx-copy',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  paste: {
    icon: 'bx-paste',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  stickynote: {
    icon: 'bx-sticker',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  link: {
    icon: 'bx-link',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  media: {
    icon: 'bx-image-add',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
  tape: {
    icon: 'bx-band-aid',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
    tapePresetCustomizable: true,
  },
  reminder: {
    icon: 'bx-bell',
    colorCustomizable: true,
    sizeCustomizable: true,
    visibilityCustomizable: true,
  },
  customColor: {
    icon: 'bxs-palette',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: true, // default for the picker's show/hide-modifier toggle
  },
  defaultPen: {
    icon: 'bx-pen',
    colorCustomizable: false,
    sizeCustomizable: false,
    visibilityCustomizable: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-toolbox tool sets — which tools appear in each radial toolbox.
// ─────────────────────────────────────────────────────────────────────────────

export type ToolboxKind =
  | 'press'
  | 'underline'
  | 'box'
  | 'curly'
  | 'squareBracket'
  | 'wavyBracket'
  | 'circleBracket';

export const TOOLBOX_SELECTION: Readonly<Record<ToolboxKind, readonly ToolId[]>> = {
  press: [
    TOOL_ID.PEN,
    TOOL_ID.HIGHLIGHT,
    TOOL_ID.ERASER,
    TOOL_ID.MEDIA,
    TOOL_ID.PASTE,
    TOOL_ID.CUSTOM_COLOR,
    TOOL_ID.DEFAULT_PEN,
  ],
  squareBracket: [
    TOOL_ID.PEN,
    TOOL_ID.TITLE1,
    TOOL_ID.TITLE2,
    TOOL_ID.TITLE3,
    TOOL_ID.HIGHLIGHT,
    TOOL_ID.DELETE,
    TOOL_ID.COPY,
    TOOL_ID.PASTE,
    TOOL_ID.ERASER,
    TOOL_ID.CUSTOM_COLOR,
  ],
  wavyBracket: [
    TOOL_ID.PEN,
    TOOL_ID.TITLE1,
    TOOL_ID.TITLE2,
    TOOL_ID.TITLE3,
    TOOL_ID.HIGHLIGHT,
    TOOL_ID.DELETE,
    TOOL_ID.COPY,
    TOOL_ID.PASTE,
    TOOL_ID.ERASER,
    TOOL_ID.CUSTOM_COLOR,
  ],
  circleBracket: [
    TOOL_ID.PEN,
    TOOL_ID.TITLE1,
    TOOL_ID.TITLE2,
    TOOL_ID.TITLE3,
    TOOL_ID.HIGHLIGHT,
    TOOL_ID.DELETE,
    TOOL_ID.COPY,
    TOOL_ID.PASTE,
    TOOL_ID.ERASER,
    TOOL_ID.REMINDER,
    TOOL_ID.CUSTOM_COLOR,
  ],
  underline: [
    TOOL_ID.PEN,
    TOOL_ID.TITLE1,
    TOOL_ID.TITLE2,
    TOOL_ID.TITLE3,
    TOOL_ID.HIGHLIGHT,
    TOOL_ID.STICKY,
    TOOL_ID.BOLD_DEFAULT,
    TOOL_ID.BOLD_CUSTOM,
    TOOL_ID.DELETE,
    TOOL_ID.MOVE,
    TOOL_ID.LINK,
    TOOL_ID.TAPE,
    TOOL_ID.COPY,
    TOOL_ID.PASTE,
    TOOL_ID.CUSTOM_COLOR,
  ],
  box: [
    TOOL_ID.PEN,
    TOOL_ID.TITLE1,
    TOOL_ID.TITLE2,
    TOOL_ID.TITLE3,
    TOOL_ID.HIGHLIGHT,
    TOOL_ID.STICKY,
    TOOL_ID.BOLD_DEFAULT,
    TOOL_ID.BOLD_CUSTOM,
    TOOL_ID.DELETE,
    TOOL_ID.MOVE,
    TOOL_ID.LINK,
    TOOL_ID.TAPE,
    TOOL_ID.COPY,
    TOOL_ID.PASTE,
    TOOL_ID.REMINDER,
    TOOL_ID.CUSTOM_COLOR,
  ],
  curly: [
    TOOL_ID.PEN,
    TOOL_ID.TITLE1,
    TOOL_ID.TITLE2,
    TOOL_ID.TITLE3,
    TOOL_ID.HIGHLIGHT,
    TOOL_ID.STICKY,
    TOOL_ID.BOLD_DEFAULT,
    TOOL_ID.BOLD_CUSTOM,
    TOOL_ID.DELETE,
    TOOL_ID.MOVE,
    TOOL_ID.LINK,
    TOOL_ID.TAPE,
    TOOL_ID.COPY,
    TOOL_ID.PASTE,
    TOOL_ID.REMINDER,
    TOOL_ID.MATH,
    TOOL_ID.CUSTOM_COLOR,
  ],
};

// Short human-readable labels shown under each radial-toolbox tool.
export const TOOL_LABELS: Record<ToolId, string> = {
  eraser: 'Eraser',
  pen: 'Pen',
  title1: 'H1',
  title2: 'H2',
  title3: 'H3',
  highlight: 'Highlight',
  delete: 'Delete',
  move: 'Move',
  bold: 'Bold',
  bold_custom: 'Bold',
  copy: 'Copy',
  paste: 'Paste',
  stickynote: 'Sticky',
  link: 'Link',
  mathSolver: 'Math',
  media: 'Media',
  tape: 'Tape',
  reminder: 'Reminder',
  customColor: 'Custom',
  defaultPen: 'Default',
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-slot toolbox configuration. Each radial toolbox holds up to 8 tools, each
// with its own color / size / visibility / tape preset.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolboxToolConfig {
  id: ToolId;
  color?: string;
  size?: number;
  visibility?: boolean;
  tapePreset?: string;
}

export type ToolboxLayout = Record<ToolboxKind, ToolboxToolConfig[]>;

// Ported verbatim from DEFAULT_TOOLBOX_LAYOUT in app/main.js.
export const DEFAULT_TOOLBOX_LAYOUT: ToolboxLayout = {
  press: [
    { id: TOOL_ID.ERASER, color: '#ffffff', size: 2 },
    { id: TOOL_ID.PEN, color: '#ffffff', size: 2 },
    { id: TOOL_ID.PEN, color: '#a3fba9', size: 3 },
    { id: TOOL_ID.CUSTOM_COLOR, color: '#ffffff', size: 2 },
    { id: TOOL_ID.HIGHLIGHT, color: '#9095fe', size: 30 },
    { id: TOOL_ID.HIGHLIGHT, color: '#fefe58', size: 30 },
    { id: TOOL_ID.DEFAULT_PEN, color: '#ffffff', size: 2 },
    { id: TOOL_ID.PASTE, color: '#ffffff', size: 2 },
  ],
  underline: [
    { id: TOOL_ID.TITLE1, color: '#f4c64a', visibility: true, size: 3 },
    { id: TOOL_ID.TITLE2, color: '#ff9a52', visibility: true, size: 3 },
    { id: TOOL_ID.TITLE3, color: '#ffbb8a', visibility: false, size: 2.8 },
    { id: TOOL_ID.HIGHLIGHT, color: '#fefe58', size: 2 },
    { id: TOOL_ID.TAPE, color: '#ffffff', size: 2, tapePreset: 'confetti' },
    { id: TOOL_ID.BOLD_DEFAULT, color: '#ffffff', size: 2 },
    { id: TOOL_ID.BOLD_CUSTOM, color: '#fa6e6e', visibility: true, size: 2 },
    { id: TOOL_ID.PEN, color: '#74d8ff', size: 2 },
  ],
  box: [
    { id: TOOL_ID.DELETE, color: '#ffffff', size: 2 },
    { id: TOOL_ID.MOVE, color: '#ffffff', size: 2 },
    { id: TOOL_ID.STICKY, color: '#ffffff', size: 2 },
    { id: TOOL_ID.LINK, color: '#ffffff', size: 2 },
    { id: TOOL_ID.REMINDER, color: '#ff6b6b', size: 2 },
    { id: TOOL_ID.TAPE, color: '#ff69b4', size: 2, tapePreset: 'polkadot' },
    { id: TOOL_ID.COPY, color: '#ffffff', size: 2 },
    { id: TOOL_ID.PASTE, color: '#ffffff', size: 2 },
  ],
  curly: [
    { id: TOOL_ID.BOLD_DEFAULT, color: '#ffffff', size: 2 },
    { id: TOOL_ID.BOLD_CUSTOM, color: '#55ffd7', size: 4 },
    { id: TOOL_ID.PEN, color: '#ffffff', size: 2.3, visibility: false },
    { id: TOOL_ID.TAPE, color: '#ffffff', size: 2, tapePreset: 'stripes' },
    { id: TOOL_ID.REMINDER, color: '#ff6b6b', size: 2 },
    { id: TOOL_ID.MATH, color: '#2f9e6a', size: 2 },
    { id: TOOL_ID.TAPE, color: '#ffffff', size: 2, tapePreset: 'confetti' },
    { id: TOOL_ID.TAPE, color: '#ffffff', size: 2, tapePreset: 'zigzag' },
  ],
  squareBracket: [
    { id: TOOL_ID.PEN, color: '#ffffff', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#ffffff', size: 3.5 },
    { id: TOOL_ID.PEN, color: '#a3fba9', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#74d8ff', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#fa6e6e', size: 2.3 },
    { id: TOOL_ID.TITLE1, color: '#f4c64a', size: 3 },
    { id: TOOL_ID.COPY, color: '#ffffff', size: 2 },
    { id: TOOL_ID.CUSTOM_COLOR, color: '#ffffff', size: 2 },
  ],
  wavyBracket: [
    { id: TOOL_ID.PEN, color: '#ff0000', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#ff7700', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#fff700', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#00ff4c', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#000dff', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#6200ff', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#bf00ff', size: 2.3 },
    { id: TOOL_ID.CUSTOM_COLOR, color: '#ffffff', size: 2.3 },
  ],
  circleBracket: [
    { id: TOOL_ID.ERASER, color: '#ffffff', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#ffa0a0', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#ffcd8b', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#ffe190', size: 2.3 },
    { id: TOOL_ID.PEN, color: '#92ffa6', size: 2.3 },
    { id: TOOL_ID.TITLE3, color: '#91f6ff', size: 2.3 },
    { id: TOOL_ID.COPY, color: '#ffb1de', size: 2.3 },
    { id: TOOL_ID.CUSTOM_COLOR, color: '#ffffff', size: 2.3 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Stroke-size presets (Hair → Bold) used in modifier settings.
// ─────────────────────────────────────────────────────────────────────────────

export const STROKE_SIZE_PRESETS = [
  { id: 'hair', label: 'Hair', size: 0.4 },
  { id: 'thin', label: 'Thin', size: 1.0 },
  { id: 'light', label: 'Light', size: 1.5 },
  { id: 'regular', label: 'Regular', size: 2.3 },
  { id: 'medium', label: 'Medium', size: 3.5 },
  { id: 'heavy', label: 'Heavy', size: 5.0 },
  { id: 'bold', label: 'Bold', size: 8.0 },
] as const;
