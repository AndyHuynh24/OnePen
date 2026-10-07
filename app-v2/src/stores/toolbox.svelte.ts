// ─────────────────────────────────────────────────────────────────────────────
// Toolbox session — the open radial menu + the content it operates on.
// Opened by a hold gesture; a tool selection applies to `selection`.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import type { ToolboxKind } from '$config/tools';

export type ToolboxOpenKind = ToolboxKind | 'press';

export interface ToolboxSession {
  kind: ToolboxOpenKind;
  /** screen-pixel anchor (where the hold happened) */
  x: number;
  y: number;
  /** the content the gesture selected (excludes the modifier stroke) */
  selection: Group[];
  /** id of the modifier stroke created by the gesture (null for press) */
  modifierId: number | null;
}

// raw: `selection` holds LIVE note groups (plain objects) that tools edit in place
let _session = $state.raw<ToolboxSession | null>(null);
let _hovered = $state<number | null>(null);

export const toolbox = {
  get session() {
    return _session;
  },
  get isOpen() {
    return _session !== null;
  },
  get hovered() {
    return _hovered;
  },
  open(session: ToolboxSession) {
    _session = session;
    _hovered = null;
  },
  setHovered(i: number | null) {
    _hovered = i;
  },
  close() {
    _session = null;
    _hovered = null;
  },
};
