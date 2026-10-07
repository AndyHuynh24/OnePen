// ─────────────────────────────────────────────────────────────────────────────
// Tools store — pen color/size/type, modifier configs, toolbox layouts,
// recent colors. Persisted to IndexedDB via the persistence layer.
// ─────────────────────────────────────────────────────────────────────────────

import type { ModifierConfig, ModifierKey } from '$types/group';
import { CONFIG } from '$config/constants';
import { PEN_TYPES, type PenType, type StrokeType } from '$config/strokeTypes';
import { DEFAULT_TOOLBOX_LAYOUT, type ToolboxLayout } from '$config/tools';

// Mirrors DEFAULT_MODIFIERS in app/main.js exactly so AI-driven recoloring
// produces identical results.
function defaultModifiers(): Record<ModifierKey, ModifierConfig> {
  return {
    defaultPen: { color: '#ffffff', size: 2.3, visibility: true },
    box: { color: '#ffb6ff', size: 2.3, visibility: true },
    curly: { color: '#fa6e6e', size: 2.3, visibility: true },
    squarebracket: { color: '#a3fba9', size: 2.3, visibility: false },
    wavybracket: { color: '#74d8ff', size: 2.3, visibility: false },
    circlebracket: { color: '#ffc5d3', size: 2.3, visibility: false },
  };
}

function defaultLayout(): ToolboxLayout {
  return structuredClone(DEFAULT_TOOLBOX_LAYOUT);
}

let _modifiers = $state<Record<ModifierKey, ModifierConfig>>(defaultModifiers());
let _toolboxLayout = $state<ToolboxLayout>(defaultLayout());
let _penColor = $state<string>(CONFIG.DEFAULT_PEN_COLOR);
let _penSize = $state<number>(CONFIG.DEFAULT_PEN_SIZE);
let _penType = $state<PenType | StrokeType>(PEN_TYPES.NORMAL);
let _eraserSize = $state<number>(CONFIG.DEFAULT_ERASER_SIZE);
let _recentColors = $state<string[]>([]);
// the 3 quick-color swatches on the toolbar (editable in settings)
let _quickColors = $state<string[]>(['#1a1714', '#e26a6a', '#4a6cff']);
let _syncStrokeSize = $state<boolean>(false);
let _syncBracketToolboxes = $state<boolean>(true);
let _aiOn = $state<boolean>(true);
let _eraserActive = $state<boolean>(false);

// Persistence hook — set by the persistence layer so changes to the toolbox
// layout / modifiers are saved. Kept as a callback so this store stays pure
// (no direct DB import). Called after any settings mutation.
let _onSettingsChange: (() => void) | null = null;
function persist() {
  _onSettingsChange?.();
}

export const tools = {
  get modifiers() {
    return _modifiers;
  },
  get toolboxLayout() {
    return _toolboxLayout;
  },
  get penColor() {
    return _penColor;
  },
  get penSize() {
    return _penSize;
  },
  get penType() {
    return _penType;
  },
  get eraserSize() {
    return _eraserSize;
  },
  get recentColors() {
    return _recentColors;
  },
  get quickColors() {
    return _quickColors;
  },
  /** Distinct colors currently assigned across the modifiers, radial-toolbox tool
   *  slots, and quick-color swatches — surfaced in the color panel as a quick
   *  "colors used in other tools" reference. Deduped case-insensitively, capped. */
  get toolColors(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (c?: string | null) => {
      if (!c) return;
      const key = c.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(c);
    };
    for (const m of Object.values(_modifiers)) add(m.color);
    for (const slots of Object.values(_toolboxLayout)) {
      for (const slot of slots) add(slot.color);
    }
    for (const c of _quickColors) add(c);
    return out.slice(0, 18);
  },
  get syncStrokeSize() {
    return _syncStrokeSize;
  },
  get syncBracketToolboxes() {
    return _syncBracketToolboxes;
  },
  get aiOn() {
    return _aiOn;
  },
  get eraserActive() {
    return _eraserActive;
  },

  /** Set the active pen color. By default this also records it in the recent
   *  list; pass `{ record: false }` for live previews (e.g. dragging the color
   *  picker) so the recents aren't flooded — call `pushRecentColor` once on commit. */
  setPenColor(color: string, opts: { record?: boolean } = {}) {
    _penColor = color;
    if (opts.record !== false) this.pushRecentColor(color);
  },
  setPenSize(size: number) {
    _penSize = size;
    if (_syncStrokeSize) {
      // when sync is on, mirror to the gesture modifiers — but NOT the default
      // pen, which is an independent setting (edited only in Settings).
      for (const key of Object.keys(_modifiers) as ModifierKey[]) {
        if (key === 'defaultPen') continue;
        _modifiers[key] = { ..._modifiers[key], size };
      }
    }
  },

  /** Switch the active pen to the configured Default Pen (color/size, normal
   *  type). Used by the Default-pen toolbox tool AND at startup, so the app
   *  always opens with the default pen. Does not record to recents. */
  useDefaultPen() {
    _penColor = _modifiers.defaultPen.color;
    _penSize = _modifiers.defaultPen.size;
    _penType = PEN_TYPES.NORMAL;
    _eraserActive = false;
  },
  setPenType(t: PenType | StrokeType) {
    _penType = t;
  },
  setEraserSize(s: number) {
    _eraserSize = s;
  },

  setModifier(key: ModifierKey, patch: Partial<ModifierConfig>) {
    _modifiers = { ..._modifiers, [key]: { ..._modifiers[key], ...patch } };
    persist();
  },

  setToolboxLayout(layout: ToolboxLayout) {
    _toolboxLayout = layout;
    persist();
  },

  /** Update a single toolbox slot's config (color/size/visibility/preset/id). */
  setToolboxSlot(kind: keyof ToolboxLayout, index: number, patch: Partial<ToolboxLayout[keyof ToolboxLayout][number]>) {
    const layout = structuredClone($state.snapshot(_toolboxLayout)) as ToolboxLayout;
    const slots = layout[kind];
    if (!slots || !slots[index]) return;
    slots[index] = { ...slots[index], ...patch };
    // when bracket toolboxes are synced, mirror the change to all three
    if (_syncBracketToolboxes && (kind === 'squareBracket' || kind === 'wavyBracket' || kind === 'circleBracket')) {
      for (const k of ['squareBracket', 'wavyBracket', 'circleBracket'] as const) {
        if (layout[k]?.[index]) layout[k][index] = { ...slots[index] };
      }
    }
    _toolboxLayout = layout;
    persist();
  },

  pushRecentColor(color: string) {
    const filtered = _recentColors.filter((c) => c !== color);
    _recentColors = [color, ...filtered].slice(0, 12);
  },

  /** Edit one of the 3 toolbar quick-color swatches. */
  setQuickColor(index: number, color: string) {
    if (index < 0 || index >= _quickColors.length) return;
    const next = [..._quickColors];
    next[index] = color;
    _quickColors = next;
    persist();
  },

  setSyncStrokeSize(v: boolean) {
    _syncStrokeSize = v;
    persist();
  },
  setSyncBracketToolboxes(v: boolean) {
    _syncBracketToolboxes = v;
    persist();
  },
  setAi(v: boolean) {
    _aiOn = v;
    persist();
  },
  setEraserActive(v: boolean) {
    _eraserActive = v;
  },

  resetModifiers() {
    _modifiers = defaultModifiers();
    persist();
  },
  resetToolboxLayout() {
    _toolboxLayout = defaultLayout();
    persist();
  },

  // ── persistence ────────────────────────────────────────────────────────────
  /** Register the save callback (called by the persistence layer at startup). */
  onSettingsChange(cb: () => void) {
    _onSettingsChange = cb;
  },
  /** Snapshot the persisted settings (plain JSON, no proxies). */
  settingsSnapshot() {
    return {
      modifiers: structuredClone($state.snapshot(_modifiers)),
      toolboxLayout: structuredClone($state.snapshot(_toolboxLayout)),
      quickColors: [..._quickColors],
      syncStrokeSize: _syncStrokeSize,
      syncBracketToolboxes: _syncBracketToolboxes,
      aiOn: _aiOn,
    };
  },
  /** Load persisted settings at startup (merges over defaults). */
  hydrate(s: {
    modifiers?: Record<ModifierKey, ModifierConfig>;
    toolboxLayout?: ToolboxLayout;
    quickColors?: string[];
    syncStrokeSize?: boolean;
    syncBracketToolboxes?: boolean;
    aiOn?: boolean;
  }) {
    if (s.modifiers) _modifiers = { ...defaultModifiers(), ...s.modifiers };
    if (s.toolboxLayout) _toolboxLayout = { ...defaultLayout(), ...s.toolboxLayout };
    if (Array.isArray(s.quickColors) && s.quickColors.length === 3) _quickColors = [...s.quickColors];
    if (typeof s.syncStrokeSize === 'boolean') _syncStrokeSize = s.syncStrokeSize;
    if (typeof s.syncBracketToolboxes === 'boolean') _syncBracketToolboxes = s.syncBracketToolboxes;
    if (typeof s.aiOn === 'boolean') _aiOn = s.aiOn;
  },
};
