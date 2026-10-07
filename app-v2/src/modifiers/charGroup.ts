// ─────────────────────────────────────────────────────────────────────────────
// Character-group resolution. Typed text is stored as one stroke-like group per
// character (sharing a textGroupId). An action (delete, recolor, title, …) that
// hits some characters should apply to the WHOLE text when a majority of its
// characters are affected, and to none of them otherwise. Normal strokes are
// unaffected (they always act individually).
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';

/**
 * Given the groups an action directly hit (`affected`) and the full note
 * (`all`), return the groups the action should actually apply to:
 *   • non-character groups pass through unchanged
 *   • character-strokes: if > half of a text's characters were hit, include
 *     ALL of that text's characters; otherwise include none of them.
 */
export function resolveCharGroupAction(affected: Group[], all: Group[]): Group[] {
  const result = new Map<number, Group>();
  const hitByText = new Map<string, number>();

  for (const g of affected) {
    if (g.isChar && g.textGroupId) {
      hitByText.set(g.textGroupId, (hitByText.get(g.textGroupId) ?? 0) + 1);
    } else {
      result.set(g.id, g); // normal strokes (and stray chars) act individually
    }
  }
  if (hitByText.size === 0) return [...result.values()];

  const totalByText = new Map<string, number>();
  for (const g of all) {
    if (g.isChar && g.textGroupId) {
      totalByText.set(g.textGroupId, (totalByText.get(g.textGroupId) ?? 0) + 1);
    }
  }

  const majority = new Set<string>();
  for (const [tg, hit] of hitByText) {
    const total = totalByText.get(tg) ?? hit;
    if (hit * 2 > total) majority.add(tg); // strictly more than half
  }
  if (majority.size > 0) {
    for (const g of all) {
      if (g.isChar && g.textGroupId && majority.has(g.textGroupId)) result.set(g.id, g);
    }
  }
  return [...result.values()];
}
