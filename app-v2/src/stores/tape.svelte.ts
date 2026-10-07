// ─────────────────────────────────────────────────────────────────────────────
// Tape store — the pattern chosen for new tapes + the reveal/hide fade animation.
// `fadeProgress` on a tape group is the cover amount (1 covered → 0 revealed);
// toggleReveal animates it and drives engine redraws.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { note } from './note.svelte';
import { history } from './history.svelte';
import { getEngine } from '$canvas/engineRef';
import { markDirty } from '$persistence/autosave';
import { CONFIG } from '$config/constants';

let _preset = $state<string>('polkadot');
const animating = new Set<number>();

export const tape = {
  get preset() {
    return _preset;
  },
  setPreset(id: string) {
    _preset = id;
  },

  /** Toggle a tape between covered and revealed with a fade. */
  toggleReveal(g: Group) {
    if (g.type !== 'tape' || animating.has(g.id)) return;
    g.revealed = !g.revealed;
    const target = g.revealed ? 0 : 1; // cover amount
    const from = g.fadeProgress ?? (g.revealed ? 1 : 0);
    const start = performance.now();
    const dur = CONFIG.TAPE.FADE_DURATION;
    animating.add(g.id);

    const step = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      g.fadeProgress = from + (target - from) * t;
      getEngine()?.invalidateDraw();
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        g.fadeProgress = target;
        animating.delete(g.id);
        note.commit();
        markDirty();
      }
    };
    requestAnimationFrame(step);
  },

  /** Remove a tape permanently (double-tap). */
  remove(g: Group) {
    history.capture();
    note.removeGroup(g.id);
    markDirty();
  },
};
