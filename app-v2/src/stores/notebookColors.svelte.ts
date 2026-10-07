// ─────────────────────────────────────────────────────────────────────────────
// Per-notebook color overrides. By default a notebook's color is derived from
// its name (see notebookColor.ts); the user can override it from the shelf kebab
// menu. Overrides are a { folderName -> paletteIndex } map, persisted to settings.
// ─────────────────────────────────────────────────────────────────────────────
import { defaultIndexFor } from '$lib/notebookColor';

let _overrides = $state<Record<string, number>>({});
let _onChange: (() => void) | null = null;

function changed() {
  _onChange?.();
}

export const notebookColors = {
  /** The palette index for a notebook — its override if set, else name-derived. */
  indexFor(name: string): number {
    const o = _overrides[name];
    return typeof o === 'number' ? o : defaultIndexFor(name);
  },

  /** True when the notebook has an explicit (non-default) override. */
  hasOverride(name: string): boolean {
    return typeof _overrides[name] === 'number';
  },

  setOverride(name: string, index: number) {
    _overrides = { ..._overrides, [name]: index };
    changed();
  },

  clearOverride(name: string) {
    if (!(name in _overrides)) return;
    const next = { ..._overrides };
    delete next[name];
    _overrides = next;
    changed();
  },

  /** Move an override to a new key (used when a notebook is renamed). */
  rename(oldName: string, newName: string) {
    if (!(oldName in _overrides)) return;
    const next = { ..._overrides };
    next[newName] = next[oldName];
    delete next[oldName];
    _overrides = next;
    changed();
  },

  snapshot(): Record<string, number> {
    return { ..._overrides };
  },

  hydrate(data: Record<string, number> | undefined) {
    if (data && typeof data === 'object') _overrides = { ...data };
  },

  onChange(cb: () => void) {
    _onChange = cb;
  },
};
