<script lang="ts">
  // Media edit panel — shown whenever a media is in edit mode (double-tapped).
  // No full-screen backdrop (that would block dragging the media); clicking the
  // canvas elsewhere deselects via the pointer layer.
  import { note } from '$stores/note.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { selection } from '$stores/selection.svelte';
  import { crop } from '$stores/crop.svelte';
  import { history } from '$stores/history.svelte';
  import { markDirty } from '$persistence/autosave';
  import { invalidateMediaImage } from '$canvas/media/cache';
  import { CONFIG } from '$config/constants';
  import type { Group } from '$types/group';

  const group = $derived.by<Group | null>(() => {
    if (crop.active) return null; // hide while the crop overlay is open
    const g = note.view(selection.id);
    return g && g.type === 'media' ? g : null;
  });

  const isPdf = $derived((group?.pdfTotalPages ?? 1) > 1);

  const pos = $derived.by(() => {
    const g = group;
    if (!g) return { x: 0, y: 0 };
    const sx = (g.bbox.x - viewport.offset.x) * viewport.scale;
    const sy = (g.bbox.y - viewport.offset.y) * viewport.scale;
    return {
      x: Math.max(10, Math.min(sx + g.bbox.w * viewport.scale + 10, window.innerWidth - 250)),
      y: Math.max(10, Math.min(sy, window.innerHeight - 320)),
    };
  });

  const scalePct = $derived.by(() => {
    const g = group;
    if (!g || !g.originalWidth) return 100;
    const croppedW = (g.crop?.sw ?? 1) * g.originalWidth;
    return Math.round((g.bbox.w / croppedW) * 100);
  });

  function touch() {
    note.commit();
    markDirty();
  }
  function rotate(delta: number) {
    const g = group;
    if (!g) return;
    history.capture();
    g.rotation = ((((g.rotation ?? 0) + delta) % 360) + 360) % 360;
    touch();
  }
  // one undo step per slider drag, not one per input event
  let opacityDragging = false;
  function setOpacity(e: Event) {
    const g = group;
    if (!g) return;
    if (!opacityDragging) {
      history.capture();
      opacityDragging = true;
    }
    g.opacity = Number((e.target as HTMLInputElement).value) / 100;
    touch();
  }
  function layer(delta: number) {
    const g = group;
    if (!g) return;
    history.capture();
    g.zIndex = (g.zIndex ?? 0) + delta;
    touch();
  }
  function toggleAspect(e: Event) {
    const g = group;
    if (!g) return;
    history.capture();
    g.aspectLocked = (e.target as HTMLInputElement).checked;
    touch();
  }
  function del() {
    const g = group;
    if (!g) return;
    const ids =
      isPdf && g.pdfGroupId
        ? note.groups.filter((x) => x.pdfGroupId === g.pdfGroupId).map((x) => x.id)
        : [g.id];
    history.capture();
    for (const id of ids) invalidateMediaImage(id);
    note.setGroups(note.groups.filter((x) => !ids.includes(x.id)));
    markDirty();
    selection.clear();
  }
  function close() {
    selection.clear();
  }
</script>

{#if group}
  {@const g = group}
  <div class="mp" style="left: {pos.x}px; top: {pos.y}px;">
    <header>
      <span>Edit {g.mediaType}</span>
      <button class="x" onclick={close} aria-label="Done"><i class="bx bx-check"></i></button>
    </header>

    <div class="line"><span class="lbl">Scale</span><span class="val">{scalePct}%</span></div>

    <div class="line">
      <span class="lbl">Rotate</span>
      <div class="grp">
        <button onclick={() => rotate(-CONFIG.MEDIA.ROTATION_SNAP)} aria-label="Rotate left"><i class="bx bx-rotate-left"></i></button>
        <span class="val">{g.rotation ?? 0}°</span>
        <button onclick={() => rotate(CONFIG.MEDIA.ROTATION_SNAP)} aria-label="Rotate right"><i class="bx bx-rotate-right"></i></button>
      </div>
    </div>

    <div class="line">
      <span class="lbl">Opacity</span>
      <input type="range" min="0" max="100" value={Math.round((g.opacity ?? 1) * 100)} oninput={setOpacity} onchange={() => (opacityDragging = false)} />
    </div>

    <div class="line">
      <span class="lbl">Layer</span>
      <div class="grp">
        <button onclick={() => layer(-1)} aria-label="Send back"><i class="bx bx-chevron-down"></i></button>
        <span class="val">{g.zIndex ?? 0}</span>
        <button onclick={() => layer(1)} aria-label="Bring forward"><i class="bx bx-chevron-up"></i></button>
      </div>
    </div>

    <label class="line aspect">
      <span class="lbl">Lock aspect</span>
      <input type="checkbox" checked={g.aspectLocked ?? true} onchange={toggleAspect} />
    </label>

    {#if isPdf}
      <label class="line aspect">
        <span class="lbl">Move all pages</span>
        <input type="checkbox" checked={selection.moveAll} onchange={(e) => selection.setMoveAll((e.target as HTMLInputElement).checked)} />
      </label>
    {/if}

    <button class="crop-btn" onclick={() => crop.begin(g.id)}>
      <i class="bx bx-crop"></i> Crop
    </button>

    <button class="del" onclick={del}>
      <i class="bx bx-trash"></i>
      {isPdf ? 'Delete all pages' : 'Delete'}
    </button>
  </div>
{/if}

<style>
  .mp {
    position: fixed;
    width: 240px;
    z-index: 140;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 12px;
    font-family: var(--font-ui);
    animation: mpIn var(--dur-fast) var(--ease-out);
  }
  @keyframes mpIn {
    from { opacity: 0; transform: translateY(-6px); }
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px; font-size: 0.78rem; font-weight: 600;
    color: var(--surface-fg-muted); text-transform: capitalize;
  }
  .x { width: 26px; height: 26px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .x:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .line {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 6px 0; font-size: 0.85rem; color: var(--surface-fg);
  }
  .lbl { color: var(--surface-fg-muted); }
  .val { font-variant-numeric: tabular-nums; min-width: 34px; text-align: center; }
  .grp { display: flex; align-items: center; gap: 4px; }
  .grp button { width: 30px; height: 28px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg); }
  .grp button:hover { background: var(--surface-raised); }
  .grp button i { font-size: 1.05rem; }
  input[type='range'] { flex: 1; accent-color: var(--accent); }
  .aspect { cursor: pointer; }
  .crop-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 8px; padding: 9px; border-radius: var(--radius-md);
    color: var(--surface-fg); border: 1px solid var(--border-strong);
    font-size: 0.85rem; font-weight: 500;
  }
  .crop-btn:hover { background: var(--surface-raised); }
  .del {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 8px; padding: 9px; border-radius: var(--radius-md);
    color: var(--danger); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
    font-size: 0.85rem; font-weight: 500;
  }
  .del:hover { background: color-mix(in oklab, var(--danger) 14%, transparent); }
</style>
