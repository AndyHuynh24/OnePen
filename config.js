// ═══════════════════════════════════════════════════════════════════════════
// CONFIG.JS - Centralized Configuration for OnePen
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = Object.freeze({
  // ─────────────────────────────────────────────────────────────────────────
  // ZOOM & SCALE
  // ─────────────────────────────────────────────────────────────────────────
  MIN_SCALE: 0.5,
  MAX_SCALE: 4.0,
  DEFAULT_SCALE: 1.0,

  // ─────────────────────────────────────────────────────────────────────────
  // GRID & BACKGROUND
  // ─────────────────────────────────────────────────────────────────────────
  DEFAULT_BG_COLOR: 'rgba(32,31,30, 1)',
  DEFAULT_GRIDLINE_COLOR: 'rgba(21,59,87, 1)',
  DEFAULT_GRID_SIZE: 58,
  MIN_GRID_SIZE: 15,
  MAX_GRID_SIZE: 60,

  // ─────────────────────────────────────────────────────────────────────────
  // DRAWING
  // ─────────────────────────────────────────────────────────────────────────
  DEFAULT_PEN_COLOR: 'rgba(255, 255, 255, 1)',
  DEFAULT_PEN_SIZE: 1.7,
  NORMAL_HEIGHT: 29,  // Standard text line height for detection

  // ─────────────────────────────────────────────────────────────────────────
  // STROKE DETECTION THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────
  WIDE_ENOUGH_WIDTH: 30,    // Minimum width for stroke classification
  WIDE_ENOUGH_HEIGHT: 52,   // Minimum height for stroke classification
  SLICE_HEIGHT: 25,         // Height for stroke slicing
  MOVEMENT_THRESHOLD: 7,    // Pixels moved before considered intentional

  // ─────────────────────────────────────────────────────────────────────────
  // MOMENTUM SCROLLING
  // ─────────────────────────────────────────────────────────────────────────
  FRICTION: 0.92,
  MIN_VELOCITY: 0.3,

  // ─────────────────────────────────────────────────────────────────────────
  // ERASER
  // ─────────────────────────────────────────────────────────────────────────
  DEFAULT_ERASER_SIZE: 20,

  // ─────────────────────────────────────────────────────────────────────────
  // UI TIMING (milliseconds)
  // ─────────────────────────────────────────────────────────────────────────
  FLASH_DURATION: 200,       // Flash animation for sticky notes/links
  COUNTDOWN_SECONDS: 1,      // Scrollbar visibility countdown
  HOLD_DURATION: 500,        // Long press detection

  // ─────────────────────────────────────────────────────────────────────────
  // TOOLBOX
  // ─────────────────────────────────────────────────────────────────────────
  TOOLBOX_RADIUS: 90,        // Radial menu radius (matches popup toolbox)
  TOOL_SIZE: 50,             // Tool button size (2 * 25)
  TOOLBOX_CENTER: 140,       // Center point offset (280px container / 2)

  // ─────────────────────────────────────────────────────────────────────────
  // AI/PREDICTION
  // ─────────────────────────────────────────────────────────────────────────
  MODEL_INPUT_SIZE: 136,

  // Confidence thresholds for stroke classification
  CLASS_THRESHOLDS: Object.freeze({
    underline: 0.65,
    box: 0.8,
    curly: 0.65,
    delete: 0.50,
    boxshortcut: 0.65,
    curlyshortcut: 0.65,
    circleshortcut: 0.65,
    nonedot: 0.6,
    nonedaulon: 0.6,
    nonenhon: 0.6,
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // INDEXEDDB
  // ─────────────────────────────────────────────────────────────────────────
  DB_NAME: 'NotesDatabase',
  DB_VERSION: 1,

  // ─────────────────────────────────────────────────────────────────────────
  // MODIFIER DEFAULT COLORS
  // ─────────────────────────────────────────────────────────────────────────
  COLORS: Object.freeze({
    BOX: 'rgba(255,182,255,1)',
    CURLY: 'rgba(250,110,110,1)',
    BOX_SHORTCUT: 'rgba(163,251,169,1)',
    CURLY_SHORTCUT: 'rgba(116, 232, 256,1)',
    FLASH_STICKY: '#FFD700',
    FLASH_LINK: '#00b7ff',
    FLASH_TAPE: '#ff69b4',
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // TAPE (Flashcard Cover)
  // ─────────────────────────────────────────────────────────────────────────
  TAPE: Object.freeze({
    FADE_DURATION: 300,           // Fade animation duration in ms
    DOUBLE_CLICK_DELAY: 300,      // Max time between clicks for double-click
    PATTERN_SIZE: 64,             // Default pattern tile size
    BORDER_WIDTH: 3,              // Border width when revealed
    PRESETS: Object.freeze([
      { id: 'polkadot', name: 'Polka Dots', color1: '#ff6b9d', color2: '#ffd93d' },
      { id: 'stripes', name: 'Candy Stripes', color1: '#4ecdc4', color2: '#ff6b6b' },
      { id: 'stars', name: 'Starry', color1: '#a855f7', color2: '#fbbf24' },
      { id: 'hearts', name: 'Hearts', color1: '#f472b6', color2: '#fca5a5' },
      { id: 'confetti', name: 'Confetti', color1: '#34d399', color2: '#60a5fa' },
      { id: 'zigzag', name: 'Zigzag', color1: '#fb923c', color2: '#fef08a' },
    ]),
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // MEDIA (Images & PDFs)
  // ─────────────────────────────────────────────────────────────────────────
  MEDIA: Object.freeze({
    MIN_SIZE: 50,              // Minimum dimension in pixels
    MAX_SIZE: 2000,            // Maximum dimension
    DEFAULT_OPACITY: 1.0,
    LONG_PRESS_MS: 500,        // Long press duration for edit mode
    HANDLE_SIZE: 12,           // Resize handle size
    ROTATION_SNAP: 90,         // Rotation increment in degrees
    DEFAULT_INSERT_WIDTH: 700, // Default width when inserting
    PDF_RENDER_SCALE: 16.0,    // HiDPI render scale for crisp PDFs at any size
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// STROKE TYPES - Classification labels for AI prediction
// ═══════════════════════════════════════════════════════════════════════════
const STROKE_TYPE = Object.freeze({
  UNDERLINE: "underline",
  BOX: "box",
  CURLY: "curly",
  DELETE: "delete",
  BOXS: "boxshortcut",
  CURLYS: "curlyshortcut",
  CIRCLES: "circleshortcut",
  HIGHLIGHT: "highlight",
  MOVE: "move",
  NONE: "none",
});

// ═══════════════════════════════════════════════════════════════════════════
// TOOL IDENTIFIERS
// ═══════════════════════════════════════════════════════════════════════════
const TOOL_ID = Object.freeze({
  ERASER: "eraser",
  PEN: "pen",
  TITLE1: "title1",
  TITLE2: "title2",
  TITLE3: "title3",
  HIGHLIGHT: "highlight",
  DELETE: "delete",
  MOVE: "move",
  BOLD: "bold",
  COPY: "copy",
  PASTE: "paste",
  STICKY: "stickynote",
  LINK: "link",
  MATH: "mathSolver",
  MEDIA: "media",
  TAPE: "tape",
});


const TOOLBOX_SELECTION = {
  color: Object.freeze({
    PEN: "pen",
    HIGHLIGHT: "highlight",
    ERASER: "eraser",
    MEDIA: "media",
    PASTE: "paste",
  }),
  underline: Object.freeze({
    TITLE1: "title1",
    TITLE2: "title2",
    TITLE3: "title3",
    HIGHLIGHT: "highlight",
    STICKY: "stickynote",
    BOLD_DEFAULT: "bold",
    BOLD_CUSTOM: "bold_custom",
    DELETE: "delete",
    MOVE: "move",
    LINK: "link",
    TAPE: "tape",
    COPY: "copy",
    PASTE: "paste",
  }),
  box: Object.freeze({
    TITLE1: "title1",
    TITLE2: "title2",
    TITLE3: "title3",
    HIGHLIGHT: "highlight",
    STICKY: "stickynote",
    BOLD_DEFAULT: "bold",
    BOLD_CUSTOM: "bold_custom",
    DELETE: "delete",
    MOVE: "move",
    LINK: "link",
    TAPE: "tape",
    COPY: "copy",
    PASTE: "paste",
  }),
  curly: Object.freeze({
    TITLE1: "title1",
    TITLE2: "title2",
    TITLE3: "title3",
    HIGHLIGHT: "highlight",
    STICKY: "stickynote",
    BOLD_DEFAULT: "bold",
    BOLD_CUSTOM: "bold_custom",
    DELETE: "delete",
    MOVE: "move",
    LINK: "link",
    TAPE: "tape",
    COPY: "copy",
    PASTE: "paste",
  })
}
// ═══════════════════════════════════════════════════════════════════════════
// PEN TYPES
// ═══════════════════════════════════════════════════════════════════════════
const PEN_TYPES = Object.freeze({
  NORMAL: "none",
  TITLE: "title",
  HIGHLIGHTER: "highlighter",
  BOLD: "bold"
});

// ═══════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY - Icon mappings and customization flags
// ═══════════════════════════════════════════════════════════════════════════
const TOOL_REGISTRY = Object.freeze({
  eraser: { icon: "bx-eraser", customizable: false },
  pen: { icon: "bx-pen", customizable: true },
  title1: { icon: "bx-capitalize", customizable: true },
  title2: { icon: "bx-capitalize", customizable: true },
  title3: { icon: "bx-capitalize", customizable: true },
  highlight: { icon: "bx-highlight", customizable: true },
  bold: { icon: "bx-bold", color: "red", customizable: false },
  bold_custom: { icon: "bx-bold", color: "white", customizable: true },
  delete: { icon: "bx-trash", customizable: false },
  move: { icon: "bx-move", customizable: false },
  mathSolver: { icon: "bx-calculator", customizable: false },
  copy: { icon: "bx-copy", customizable: false },
  paste: { icon: "bx-paste", customizable: false },
  stickynote: { icon: "bx-sticker", customizable: false },
  link: { icon: "bx-link-break", customizable: false },
  media: { icon: "bx-file-plus", customizable: false },
  tape: { icon: "bx-band-aid", customizable: true }
});

// ═══════════════════════════════════════════════════════════════════════════
// APP MODES - State machine modes
// ═══════════════════════════════════════════════════════════════════════════
const APP_MODES = Object.freeze({
  IDLE: 'IDLE',
  DRAWING: 'DRAWING',
  ERASING: 'ERASING',
  PANNING: 'PANNING',
  MOVING: 'MOVING',
  SHAPE: 'SHAPE',
  SELECTING: 'SELECTING'
});

// ═══════════════════════════════════════════════════════════════════════════
// CLASSES ARRAY - Maps prediction indices to stroke types
// ═══════════════════════════════════════════════════════════════════════════
const CLASSES = Object.freeze([
  STROKE_TYPE.UNDERLINE,
  STROKE_TYPE.BOX,
  STROKE_TYPE.CURLY,
  STROKE_TYPE.DELETE,
  STROKE_TYPE.BOXS,
  STROKE_TYPE.CURLYS,
  STROKE_TYPE.CIRCLES,
  STROKE_TYPE.NONE,
  STROKE_TYPE.NONE,
  STROKE_TYPE.NONE,
]);
