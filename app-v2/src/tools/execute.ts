// ─────────────────────────────────────────────────────────────────────────────
// Tool execution — applies a chosen radial-toolbox tool to the gesture's
// selection. Ported from executeTool() in app/main.js. History is already
// captured at hold time, so each tool just mutates + commits.
//
// Handles every toolbox tool: styling (pen / default pen / custom color /
// title 1–3 / highlight / bold), structural (delete / eraser / move / copy /
// paste), annotations (sticky / link / tape / reminder), media insert, and the
// math solver.
// ─────────────────────────────────────────────────────────────────────────────

import type { Group } from '$types/group';
import { STROKE_TYPE, PEN_TYPES } from '$config/strokeTypes';
import { TOOL_ID } from '$config/tools';
import type { ToolboxToolConfig } from '$config/tools';
import { note } from '$stores/note.svelte';
import { tools } from '$stores/tools.svelte';
import { viewport } from '$stores/viewport.svelte';
import { toolbox, type ToolboxSession } from '$stores/toolbox.svelte';
import { colorPicker } from '$stores/colorPicker.svelte';
import { toast } from '$stores/toast.svelte';
import { history } from '$stores/history.svelte';
import { clipboard } from '$stores/clipboard.svelte';
import { moveMode } from '$stores/move.svelte';
import { reminder } from '$stores/reminder.svelte';
import { annot } from '$stores/annot.svelte';
import { tape } from '$stores/tape.svelte';
import { solveMath } from '$tools/math';
import { handleMediaInsert } from '$tools/media';
import { markDirty } from '$persistence/autosave';
import { getBoundingBox } from '$canvas/hitTest';
import { getEngine } from '$canvas/engineRef';
import { hexToRgb, alterRgbaBrightness } from '$lib/color';
import { resolveCharGroupAction } from '$modifiers/charGroup';
import { gestureFeedback } from '$ml/feedback';

function isColorProtected(g: Group): boolean {
  const t = g.type as string | undefined;
  return (
    t === 'highlight' ||
    t === 'stickynote' ||
    t === 'tape' ||
    g.predictedLabel === STROKE_TYPE.HIGHLIGHT ||
    g.predictedLabel === PEN_TYPES.HIGHLIGHTER
  );
}

function removeModifier(session: ToolboxSession): void {
  if (session.modifierId == null) return;
  const i = note.groups.findIndex((g) => g.id === session.modifierId);
  if (i !== -1) note.groups.splice(i, 1);
}

function hideModifier(session: ToolboxSession): void {
  if (session.modifierId == null) return;
  const g = note.groups.find((g) => g.id === session.modifierId);
  if (g) g.visibility = false;
}

/** Select the tool at `index` within the current toolbox's layout (release-to-activate). */
export function selectToolByIndex(index: number): void {
  const session = toolbox.session;
  if (!session) return;
  const layout = tools.toolboxLayout[session.kind];
  const cfg = layout?.[index];
  if (cfg) executeTool(cfg);
  else dismissToolbox();
}

/** Close the toolbox without applying a tool — removes the placeholder gesture
 *  stroke (non-press) and discards its undo snapshot. */
export function dismissToolbox(): void {
  const session = toolbox.session;
  if (!session) {
    return;
  }
  if (session.kind !== 'press' && session.modifierId != null) {
    const i = note.groups.findIndex((g) => g.id === session.modifierId);
    if (i !== -1) {
      note.groups.splice(i, 1);
      note.commit();
    }
  }
  history.dropLast();
  gestureFeedback.noteToolbox('dismissed', session.kind);
  toolbox.close();
}

/** Run a tool against the current toolbox session, then close the toolbox. */
export function executeTool(cfg: ToolboxToolConfig): void {
  const session = toolbox.session;
  if (!session) return;
  gestureFeedback.noteToolbox('selected', session.kind, cfg.id);
  const isPress = session.kind === 'press';
  const selection = session.selection;
  // text reacts by majority: a tool only touches a typed word if > half of its
  // characters are selected (then it applies to the whole word).
  const targets = resolveCharGroupAction(selection, note.groups);

  // The UNDERLINE modifier is visible content you keep (unlike box/curly/bracket,
  // which are selection lassos that get removed/hidden). So styling tools should
  // color/size/title the underline stroke itself too — include it in the targets.
  // (Annotation tools below still exclude it via `session.modifierId`.)
  if (session.kind === 'underline' && session.modifierId != null) {
    const mod = note.groups.find((g) => g.id === session.modifierId);
    if (mod && !targets.includes(mod)) targets.push(mod);
  }
  const color = cfg.color ?? tools.penColor;
  const size = cfg.size ?? tools.penSize;
  const id = cfg.id;

  if (id === TOOL_ID.PEN) {
    tools.setEraserActive(false);
    if (cfg.visibility === false) removeModifier(session);
    if (isPress) {
      tools.setPenColor(color);
      tools.setPenSize(size);
      tools.setPenType(PEN_TYPES.NORMAL);
    } else {
      recolor(targets, color, size);
      // a kept (visible) gesture stroke takes the pen color too, like custom color
      const mod =
        session.modifierId == null ? undefined : note.groups.find((g) => g.id === session.modifierId);
      if (mod) mod.color = color;
    }
  } else if (id === TOOL_ID.DEFAULT_PEN) {
    tools.useDefaultPen();
  } else if (id === TOOL_ID.CUSTOM_COLOR) {
    // open the universal color panel (custom picker + recent colors) at the
    // toolbox anchor; apply each chosen color (live preview + final). On a
    // gesture selection the panel also offers show/hide for the gesture stroke;
    // a shown stroke takes the picked color too. Every pick/toggle lands in the
    // hold's undo step, so one undo reverts the whole thing.
    const modId = isPress ? null : session.modifierId;
    let showMod = cfg.visibility ?? true;
    let picked: string | null = null;
    const syncModifier = () => {
      const mod = modId == null ? undefined : note.groups.find((g) => g.id === modId);
      if (!mod) return;
      mod.visibility = showMod;
      if (showMod && picked) mod.color = picked;
    };
    syncModifier();
    const refresh = () => {
      note.commit();
      markDirty();
      getEngine()?.invalidateDrawFull();
    };
    colorPicker.open({
      value: color,
      x: session.x,
      y: session.y,
      onPick: (c) => {
        picked = c;
        if (isPress) {
          tools.setEraserActive(false);
          tools.setPenColor(c);
          tools.setPenType(PEN_TYPES.NORMAL);
        } else {
          recolor(targets.filter((g) => g.id !== modId), c, size);
          syncModifier();
        }
        refresh();
      },
      modifier:
        modId == null
          ? undefined
          : {
              visible: showMod,
              onToggle: (v) => {
                showMod = v;
                syncModifier();
                refresh();
              },
            },
    });
  } else if (id === TOOL_ID.HIGHLIGHT) {
    if (isPress) {
      tools.setEraserActive(false);
      tools.setPenColor(hexToRgb(color) ?? color);
      tools.setPenSize(size);
      tools.setPenType(PEN_TYPES.HIGHLIGHTER);
    } else {
      createHighlight(targets, session, color);
    }
  } else if (id === TOOL_ID.TITLE1) {
    applyTitle(targets, session, color, size, 1, cfg.visibility);
  } else if (id === TOOL_ID.TITLE2) {
    applyTitle(targets, session, color, size, 2, cfg.visibility);
  } else if (id === TOOL_ID.TITLE3) {
    applyTitle(targets, session, color, size, 3, cfg.visibility);
  } else if (id === TOOL_ID.BOLD_DEFAULT || id === TOOL_ID.BOLD_CUSTOM) {
    applyBold(targets, session, id, color, cfg.visibility);
  } else if (id === TOOL_ID.DELETE) {
    for (const g of targets) {
      const i = note.groups.indexOf(g);
      if (i !== -1) note.groups.splice(i, 1);
    }
    removeModifier(session);
  } else if (id === TOOL_ID.ERASER) {
    tools.setEraserActive(true);
    removeModifier(session);
  } else if (id === TOOL_ID.MOVE) {
    removeModifier(session);
    if (targets.length === 0) {
      history.dropLast();
      toast.show('Nothing to move', 'bx-info-circle');
    } else {
      moveMode.begin([...targets]); // the next drag repositions the selection
    }
  } else if (id === TOOL_ID.COPY) {
    removeModifier(session);
    if (targets.length === 0) {
      toast.show('Nothing to copy', 'bx-info-circle');
    } else {
      clipboard.copy(targets);
      toast.show(`Copied ${targets.length} item${targets.length === 1 ? '' : 's'}`, 'bx-copy');
    }
    history.dropLast(); // copy makes no persistent change
  } else if (id === TOOL_ID.PASTE) {
    removeModifier(session);
    if (!clipboard.hasItems) {
      history.dropLast();
      toast.show('Clipboard is empty', 'bx-info-circle');
    } else {
      startPaste();
    }
  } else if (id === TOOL_ID.REMINDER) {
    // the gesture (box/curly/bracket) is only a selection lasso — never part of
    // the annotation content, so drop it from the targets.
    const content = targets.filter((g) => g.id !== session.modifierId);
    removeModifier(session);
    if (content.length === 0) {
      history.dropLast();
      toast.show('Nothing to remind on', 'bx-info-circle');
    } else {
      // defer the actual tagging until the user picks a date; the hold snapshot
      // stays on the stack (kept on confirm, dropped on cancel)
      const ids = content.map((g) => g.id);
      reminder.openPicker(ids, () => {
        history.dropLast();
        note.commit();
        markDirty();
      });
    }
  } else if (id === TOOL_ID.LINK) {
    const content = targets.filter((g) => g.id !== session.modifierId);
    removeModifier(session);
    if (content.length === 0) {
      history.dropLast();
      toast.show('Nothing to link', 'bx-info-circle');
    } else {
      const g = makeAnnotation('link', content, 6);
      g.url = '';
      g.color = '#4a6cff';
      note.groups.push(g);
      annot.editLink(g.id); // prompt for the URL
    }
  } else if (id === TOOL_ID.STICKY) {
    const content = targets.filter((g) => g.id !== session.modifierId);
    removeModifier(session);
    if (content.length === 0) {
      history.dropLast();
      toast.show('Nothing to annotate', 'bx-info-circle');
    } else {
      const g = makeAnnotation('stickynote', content, 6);
      g.noteText = '';
      g.color = '#feff9c';
      note.groups.push(g);
      annot.openSticky(g.id); // open the note popup
    }
  } else if (id === TOOL_ID.TAPE) {
    const content = targets.filter((g) => g.id !== session.modifierId);
    removeModifier(session);
    if (content.length === 0) {
      history.dropLast();
      toast.show('Nothing to cover', 'bx-info-circle');
    } else {
      const g = makeAnnotation('tape', content, 0);
      g.preset = cfg.tapePreset ?? tape.preset;
      g.revealed = false;
      g.fadeProgress = 1;
      g.color = '#000000';
      note.groups.push(g);
    }
  } else if (id === TOOL_ID.MATH) {
    const content = targets.filter((g) => g.id !== session.modifierId);
    removeModifier(session);
    history.dropLast(); // solveMath captures its own history when a result lands
    void solveMath(content); // async: rasterize → backend → append result group
  } else if (id === TOOL_ID.MEDIA) {
    removeModifier(session);
    history.dropLast(); // media insert manages its own history
    handleMediaInsert();
  } else {
    toast.show(`${labelFor(id)} isn't available here`, 'bx-info-circle');
  }

  note.commit();
  markDirty();
  // Tools edit groups IN PLACE (recolor / title / bold / reminder tags). The
  // engine's append path keys off object identity, so it can't see those edits —
  // force a full repaint. See CanvasEngine.invalidateDrawFull().
  getEngine()?.invalidateDrawFull();
  toolbox.close();
}

/** Build a stroke-annotation group (link / sticky / tape) covering `targets`.
 *  `stroke` holds the flattened points of the covered strokes (for bbox + later
 *  flashcard use); `coveredGroupIds` records what it marks. `pad` insets the
 *  bbox outward so the hint/cover sits comfortably around the ink. */
function makeAnnotation(type: 'link' | 'stickynote' | 'tape', targets: Group[], pad: number): Group {
  const pts: { x: number; y: number }[] = [];
  for (const g of targets) {
    if (g.stroke && g.stroke.length) pts.push(...g.stroke);
    else if (g.bbox) {
      pts.push({ x: g.bbox.x, y: g.bbox.y }, { x: g.bbox.x + g.bbox.w, y: g.bbox.y + g.bbox.h });
    }
  }
  const bbox = getBoundingBox(pts);
  bbox.x -= pad;
  bbox.y -= pad;
  bbox.w += pad * 2;
  bbox.h += pad * 2;
  return {
    id: note.nextId(),
    type,
    bbox,
    stroke: pts,
    coveredGroupIds: targets.map((t) => t.id),
    color: '#4a6cff',
    size: 1,
  };
}

/** Tag the given groups with a reminder due date (called by the picker). The
 *  hold snapshot is already on the history stack, so this is a single undo. */
export function applyReminder(ids: number[], dateISO: string): void {
  const gid = `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  for (const g of note.groups) {
    if (!ids.includes(g.id)) continue;
    g.reminderStatus = true;
    g.reminderDate = dateISO;
    g.reminderGroupId = gid;
  }
  note.commit();
  markDirty();
  getEngine()?.invalidateDrawFull(); // in-place tag → append path can't see it
}

/** Clone the clipboard into a movable paste preview, centered in the current
 *  viewport so it's always visible (the move box lets the user reposition). */
function startPaste(): void {
  const cloned = clipboard.items.map((g) => {
    const copy = JSON.parse(JSON.stringify(g)) as Group;
    copy.id = note.nextId();
    return copy;
  });
  if (cloned.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of cloned) {
    minX = Math.min(minX, g.bbox.x);
    minY = Math.min(minY, g.bbox.y);
    maxX = Math.max(maxX, g.bbox.x + g.bbox.w);
    maxY = Math.max(maxY, g.bbox.y + g.bbox.h);
  }
  const bw = maxX - minX;
  const bh = maxY - minY;

  // shift the clone so its center lands at the center of the visible viewport
  const viewCx = viewport.offset.x + viewport.screenW / (2 * viewport.scale);
  const viewCy = viewport.offset.y + viewport.screenH / (2 * viewport.scale);
  const dx = viewCx - (minX + bw / 2);
  const dy = viewCy - (minY + bh / 2);
  for (const g of cloned) {
    g.bbox.x += dx;
    g.bbox.y += dy;
    if (g.stroke) for (const p of g.stroke) {
      p.x += dx;
      p.y += dy;
    }
  }

  clipboard.beginPaste(cloned, { x: minX + dx, y: minY + dy, w: bw, h: bh });
}

function recolor(selection: Group[], color: string, size: number): void {
  for (const g of selection) {
    if (isColorProtected(g)) continue;
    g.color = color;
    g.size = size;
  }
}

function applyTitle(
  targets: Group[],
  session: ToolboxSession,
  color: string,
  size: number,
  level: 1 | 2 | 3,
  visibility: boolean | undefined,
): void {
  if (visibility === false) hideModifier(session);
  const gid = `title_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  for (const g of targets) {
    const isHL = isColorProtected(g);
    g.titleStatus = true;
    g.titleLevel = level;
    if (!isHL) g.color = color;
    g.size = size;
    g.titleGroupId = gid;
  }
}

function applyBold(
  targets: Group[],
  session: ToolboxSession,
  id: string,
  color: string,
  visibility: boolean | undefined,
): void {
  if (id === TOOL_ID.BOLD_DEFAULT || visibility === false) removeModifier(session);
  for (const g of targets) {
    if (isColorProtected(g)) continue;
    g.size = (Number(g.size) || 2) + 2;
    g.color = id === TOOL_ID.BOLD_DEFAULT ? alterRgbaBrightness(g.color) : color;
  }
}

function createHighlight(targets: Group[], session: ToolboxSession, colorHex: string): void {
  removeModifier(session);
  const pts: { x: number; y: number }[] = [];
  for (const g of targets) {
    if (g.type === 'text') {
      pts.push({ x: g.bbox.x, y: g.bbox.y }, { x: g.bbox.x + g.bbox.w, y: g.bbox.y + g.bbox.h });
    } else if (g.stroke) {
      pts.push(...g.stroke);
    }
  }
  if (pts.length === 0) return;
  const bbox = getBoundingBox(pts);
  const hp = bbox.h * 0.1;
  const vp = bbox.h * 0.1;
  const su = bbox.h * 0.025;
  bbox.x -= hp;
  bbox.y = bbox.y - vp - su;
  bbox.w += hp * 2;
  bbox.h += (vp + su) * 2;

  const first = targets[0];
  const last = targets[targets.length - 1];
  note.groups.push({
    id: note.nextId(),
    stroke: [...(first.stroke ?? []), ...(last.stroke ?? [])],
    bbox,
    color: hexToRgb(colorHex) ?? colorHex,
    predictedLabel: STROKE_TYPE.NONE,
    type: 'highlight',
    titleStatus: false,
    size: 1,
  });
}

function labelFor(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
