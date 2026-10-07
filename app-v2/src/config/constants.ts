// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — centralized configuration for OnePen
// Mirrors the original app/config.js, ported to TypeScript and frozen at compile
// time so values can't drift at runtime.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  // zoom & scale
  MIN_SCALE: 0.5,
  MAX_SCALE: 4.0,
  DEFAULT_SCALE: 1.0,

  // grid
  DEFAULT_GRID_SIZE: 58,
  MIN_GRID_SIZE: 15,
  MAX_GRID_SIZE: 60,

  // drawing
  DEFAULT_PEN_COLOR: 'rgba(255, 255, 255, 1)',
  DEFAULT_PEN_SIZE: 1.7,
  NORMAL_HEIGHT: 29, // standard text line height for detection

  // stroke detection thresholds
  WIDE_ENOUGH_WIDTH: 30,
  WIDE_ENOUGH_HEIGHT: 52,
  MOVEMENT_THRESHOLD: 4,

  // momentum scrolling
  FRICTION: 0.92,
  MIN_VELOCITY: 0.3,

  // eraser
  DEFAULT_ERASER_SIZE: 20,

  // AI / prediction
  CLASS_THRESHOLDS: {
    underline: 0.8,
    box: 0.8,
    curly: 0.8,
    delete: 0.65,
    squarebracket: 0.8,
    wavybracket: 0.8,
    circlebracket: 0.8,
    none: 0.8,
  },

  // IndexedDB
  DB_NAME: 'onepen-db',
  DB_VERSION: 3,
  LEGACY_DB_NAME: 'dsh-note-db',
  LEGACY_DB_VERSION: 2,

  // tape (flashcard cover)
  TAPE: {
    FADE_DURATION: 140,
    PATTERN_SIZE: 64,
    PRESETS: [
      { id: 'polkadot', name: 'Polka Dots', color1: '#ff6b9d', color2: '#ffd93d' },
      { id: 'stripes', name: 'Candy Stripes', color1: '#4ecdc4', color2: '#ff6b6b' },
      { id: 'stars', name: 'Starry', color1: '#a855f7', color2: '#fbbf24' },
      { id: 'hearts', name: 'Hearts', color1: '#f472b6', color2: '#fca5a5' },
      { id: 'confetti', name: 'Confetti', color1: '#34d399', color2: '#60a5fa' },
      { id: 'zigzag', name: 'Zigzag', color1: '#fb923c', color2: '#fef08a' },
    ] as const,
  },

  // media (images & PDFs)
  MEDIA: {
    MIN_SIZE: 50,
    HANDLE_SIZE: 12,
    ROTATION_SNAP: 90,
    DEFAULT_INSERT_WIDTH: 700,
  },

  // sticky notes
  STICKY: {
    COLORS: ['#feff9c', '#ffb3ba', '#bafca6', '#a6e3fc', '#ffd6a6'],
  },

  // autosave (debounced + idle-aware, see persistence/autosave.ts)
  AUTOSAVE_IDLE_MS: 1500,
  AUTOSAVE_DEBOUNCE_MS: 1500,

  // math solver (Pix2Text + latex2sympy2/SymPy backend — /math-server).
  // Priority:
  //   1. VITE_MATH_API_URL (the deployed https:// server, for production builds)
  //   2. same host as the page on :8000 — so loading the app from a tablet at
  //      http://192.168.1.x:5173 auto-targets http://192.168.1.x:8000/predict,
  //      and localhost stays localhost. Zero config for LAN dev.
  //   3. 127.0.0.1 fallback (non-browser contexts / tests).
  MATH: {
    SERVER_URL:
      import.meta.env.VITE_MATH_API_URL ||
      (typeof window !== 'undefined'
        ? `http://${window.location.hostname}:8000/predict`
        : 'http://127.0.0.1:8000/predict'),
    // /solve takes typed LaTeX directly (no OCR) — used by the edit pad. Derived
    // from SERVER_URL by swapping the trailing /predict for /solve.
    get SOLVE_URL(): string {
      return this.SERVER_URL.replace(/\/predict$/, '/solve');
    },
    RASTER_PAD: 40,
    RASTER_LINE_WIDTH: 3,
  },

  // drive backup (manual — see src/auth)
  DRIVE: {
    BACKUP_FILENAME: 'onepen_backup.json',
  },
} as const;

export type Config = typeof CONFIG;
