<script lang="ts">
  // Minimal floating toolbar:
  //   undo · redo │ pen (size dropdown) · eraser │ 3 colors + custom │ + (add) │ cards · AI
  import { tools } from '$stores/tools.svelte';
  import { history } from '$stores/history.svelte';
  import { undo as undoAction, redo as redoAction } from '$lib/undo';
  import { ui } from '$stores/ui.svelte';
  import { createTextAtCenter } from '$tools/text';
  import { handleMediaInsert } from '$tools/media';
  import { STROKE_SIZE_PRESETS } from '$config/tools';
  import ExportDialog from './ExportDialog.svelte';
  import ColorPanel from './ColorPanel.svelte';

  let exportOpen = $state(false);

  // three quick colors (editable in settings) + the custom slot (4th)
  const QUICK_COLORS = $derived(tools.quickColors);

  let sizeOpen = $state(false);
  let colorOpen = $state(false);
  let addOpen = $state(false);
  // fold the pen / eraser / color cluster in to save space
  let toolsFolded = $state(false);

  function closeAll() {
    sizeOpen = false;
    colorOpen = false;
    addOpen = false;
  }
  function toggle(which: 'size' | 'color' | 'add') {
    const wasOpen = which === 'size' ? sizeOpen : which === 'color' ? colorOpen : addOpen;
    closeAll();
    if (!wasOpen) {
      if (which === 'size') sizeOpen = true;
      else if (which === 'color') colorOpen = true;
      else addOpen = true;
    }
  }
  function toggleFold() {
    closeAll(); // any open size/color dropdown would be clipped once folded
    toolsFolded = !toolsFolded;
  }

  function undo() {
    undoAction();
  }
  function redo() {
    redoAction();
  }
  function pickColor(c: string) {
    tools.setPenColor(c);
    tools.setEraserActive(false);
  }
  function pickPen() {
    // Tapping the pen just switches to it — the size list opens only via the caret.
    tools.setEraserActive(false);
    closeAll();
  }
  // live preview while dragging the picker — no recent-list spam
  function previewColor(c: string) {
    tools.setPenColor(c, { record: false });
    tools.setEraserActive(false);
  }
  // commit on release: ColorPanel records the recent, so don't double-record here
  function commitColor(c: string) {
    tools.setPenColor(c, { record: false });
    tools.setEraserActive(false);
  }
  function add(kind: 'text' | 'image' | 'file') {
    closeAll();
    if (kind === 'text') createTextAtCenter();
    else handleMediaInsert(kind);
  }

  // the active custom color = current pen color if it isn't one of the quick ones
  const customSwatch = $derived(
    QUICK_COLORS.includes(tools.penColor) ? (tools.recentColors[0] ?? '#d9a02c') : tools.penColor,
  );
</script>

<svelte:window onpointerdown={(e) => { if (!(e.target as HTMLElement).closest('.bar')) closeAll(); }} />

{#snippet colorPicker()}
  <div class="dd colors">
    <ColorPanel
      value={customSwatch}
      onpreview={previewColor}
      oncommit={commitColor}
      onrecent={(c) => { pickColor(c); colorOpen = false; }}
    />
  </div>
{/snippet}

<div class="bar">
  <button class="icon" onclick={undo} disabled={!history.canUndo} title="Undo">
    <i class="bx bx-undo"></i>
  </button>
  <button class="icon" onclick={redo} disabled={!history.canRedo} title="Redo">
    <i class="bx bx-redo"></i>
  </button>
  <span class="divider"></span>

  <!-- pen / eraser / color cluster, with a small fold-tab beneath it -->
  <div class="group-wrap" class:folded={toolsFolded}>
    {#if toolsFolded}
      <!-- when folded, the slot shows the current pen color; tap to pick a color -->
      <div class="wrap">
        <button
          class="swatch folded-swatch"
          class:active={!tools.eraserActive}
          style="--color: {tools.penColor}"
          aria-label="Current color — tap to change"
          title="Current color — tap to change"
          onclick={() => toggle('color')}
        ></button>
        {#if colorOpen}{@render colorPicker()}{/if}
      </div>
    {/if}
    <div class="group" class:folded={toolsFolded} aria-hidden={toolsFolded}>
    <!-- pen + size dropdown -->
    <div class="wrap">
      <button
        class="icon"
        class:on={!tools.eraserActive}
        onclick={pickPen}
        title="Pen"
        tabindex={toolsFolded ? -1 : 0}
      >
        <i class="bx bx-pen"></i>
      </button>
      <button
        class="caret-btn"
        class:on={sizeOpen}
        onclick={() => toggle('size')}
        title="Pen size"
        aria-label="Pen size"
        tabindex={toolsFolded ? -1 : 0}
      >
        <span class="caret"></span>
      </button>
      {#if sizeOpen}
        <div class="dd sizes">
          {#each STROKE_SIZE_PRESETS as p}
            <button
              class="size-row"
              class:on={Math.abs(p.size - tools.penSize) < 0.05}
              onclick={() => { tools.setPenSize(p.size); tools.setEraserActive(false); sizeOpen = false; }}
            >
              <span class="dot" style="height: {Math.max(1, p.size)}px; background: {tools.penColor};"></span>
              <span class="size-name">{p.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button
      class="icon"
      class:on={tools.eraserActive}
      onclick={() => tools.setEraserActive(!tools.eraserActive)}
      title="Eraser"
      tabindex={toolsFolded ? -1 : 0}
    >
      <i class="bx bx-eraser"></i>
    </button>
    <span class="divider"></span>

    <!-- 3 quick colors + custom -->
    <div class="palette">
      {#each QUICK_COLORS as c (c)}
        <button
          class="swatch"
          class:active={tools.penColor === c && !tools.eraserActive}
          style="--color: {c}"
          aria-label="Color {c}"
          tabindex={toolsFolded ? -1 : 0}
          onclick={() => pickColor(c)}
        ></button>
      {/each}
      <div class="wrap">
        <button
          class="swatch custom"
          class:active={!QUICK_COLORS.includes(tools.penColor) && !tools.eraserActive}
          style="--color: {customSwatch}"
          aria-label="Custom color"
          tabindex={toolsFolded ? -1 : 0}
          onclick={() => toggle('color')}
        ><i class="bx bx-plus"></i></button>
        {#if colorOpen && !toolsFolded}{@render colorPicker()}{/if}
      </div>
    </div>
    </div>
    <button
      class="fold"
      onclick={toggleFold}
      title={toolsFolded ? 'Show pen & colors' : 'Hide pen & colors'}
      aria-label={toolsFolded ? 'Show pen & colors' : 'Hide pen & colors'}
    >
      <i class="bx {toolsFolded ? 'bx-chevron-down' : 'bx-chevron-up'}"></i>
    </button>
  </div>

  <span class="divider"></span>

  <!-- add (+) dropdown -->
  <div class="wrap">
    <button class="icon" class:on={addOpen} onclick={() => toggle('add')} title="Add">
      <i class="bx bx-plus"></i>
    </button>
    {#if addOpen}
      <div class="dd add">
        <button onclick={() => add('text')}><i class="bx bx-text"></i> Text</button>
        <button onclick={() => add('image')}><i class="bx bx-image"></i> Image</button>
        <button onclick={() => add('file')}><i class="bx bx-file"></i> File</button>
      </div>
    {/if}
  </div>

  <span class="divider"></span>
  <button class="icon" onclick={() => ui.toggleFlashcard(true)} title="Review flashcards">
    <i class="bx bx-card"></i>
  </button>
  <button class="icon" onclick={() => (exportOpen = true)} title="Export">
    <i class="bx bx-export"></i>
  </button>
  <button
    class="icon ai"
    class:on={tools.aiOn}
    onclick={() => tools.setAi(!tools.aiOn)}
    title={tools.aiOn ? 'AI gestures on' : 'AI gestures off'}
  >
    <i class="bx bx-brain"></i>
  </button>
</div>

<ExportDialog bind:open={exportOpen} />

<style>
  .bar {
    /* extrudes from the top edge — flush to the top, hanging down with rounded
       bottom corners; slimmer than before but the buttons keep their size */
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px; padding: 4px 11px 5px;
    /* Solid (no backdrop-filter): this bar sits over the canvas the whole time,
       and a backdrop blur forces the GPU to re-blur the canvas behind it on every
       single stroke frame — the constant drawing lag, worst on slow/low-power
       devices. A solid panel looks the same and costs nothing per frame. */
    background: var(--surface-panel);
    border: 1px solid var(--border); border-top: none;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    box-shadow: var(--shadow-md); z-index: 50; font-family: var(--font-ui);
  }
  .wrap { position: relative; display: flex; }

  /* collapsible pen / eraser / color cluster, with a fold-tab beneath it */
  .group-wrap { position: relative; display: flex; align-items: center; }
  .group-wrap.folded { min-width: 34px; justify-content: center; }
  .group {
    display: flex; align-items: center; gap: 6px;
    max-width: 420px; opacity: 1;
    transition: max-width var(--dur-base) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
  }
  .group:not(.folded) { overflow: visible; }
  .group.folded { max-width: 0; opacity: 0; overflow: hidden; pointer-events: none; }

  /* small horizontal pull-tab; reads as part of the bar (no shadow, top merges
     seamlessly into the bar's bottom edge) rather than a detached pill */
  .fold {
    position: absolute; left: 50%; bottom: -9px; transform: translateX(-50%);
    width: 32px; height: 11px; display: grid; place-items: center;
    background: var(--surface-panel);
    border: 1px solid var(--border); border-top: none;
    border-radius: 0 0 6px 6px;
    color: var(--surface-fg-subtle);
    transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
  }
  .fold:hover { color: var(--surface-fg); background: var(--surface-raised); }
  .fold i { font-size: 0.72rem; line-height: 1; }

  /* the current-color swatch shown in the folded slot */
  .folded-swatch { width: 22px; height: 22px; }

  .icon {
    position: relative;
    display: grid; place-items: center; width: 34px; height: 34px;
    border-radius: var(--radius-md); color: var(--surface-fg);
    transition: background var(--dur-fast) var(--ease-out);
  }
  .icon:hover:not(:disabled) { background: var(--surface-raised); }
  .icon:disabled { opacity: 0.4; cursor: not-allowed; }
  .icon i { font-size: 1.1rem; }
  /* small caret button at the pen's bottom-right corner — opens the size list
     without selecting the pen (tapping the pen body selects it) */
  .caret-btn {
    position: absolute; right: 0; bottom: 0;
    width: 16px; height: 16px; display: grid; place-items: center;
    border-radius: var(--radius-sm) 0 var(--radius-md) 0;
    color: var(--surface-fg-subtle);
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  .caret-btn:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .caret-btn.on { color: var(--accent); background: var(--accent-soft); }
  .caret {
    width: 0; height: 0; border-left: 3px solid transparent; border-right: 3px solid transparent;
    border-top: 4px solid currentColor;
  }
  .ai { color: var(--surface-fg-subtle); }
  .ai.on, .icon.on { color: var(--accent); background: var(--accent-soft); }

  .divider { width: 1px; height: 20px; background: var(--divider); }

  .palette { display: flex; align-items: center; gap: 5px; }
  .swatch {
    width: 22px; height: 22px; border-radius: 50%; background: var(--color);
    border: 2px solid var(--border-strong); display: grid; place-items: center;
    transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast);
  }
  .swatch:hover { transform: scale(1.12); }
  .swatch.active { box-shadow: 0 0 0 2px var(--surface-panel), 0 0 0 4px var(--accent); }
  .swatch.custom i { font-size: 0.85rem; color: color-mix(in oklab, var(--color) 35%, white); mix-blend-mode: difference; }

  /* dropdowns */
  .dd {
    position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
    background: var(--surface-panel); border: 1px solid var(--border);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lg); padding: 6px;
    z-index: 60; animation: ddIn var(--dur-fast) var(--ease-out);
  }
  @keyframes ddIn { from { opacity: 0; transform: translateX(-50%) translateY(-4px); } }

  .sizes { display: flex; flex-direction: column; gap: 2px; min-width: 130px; }
  .size-row {
    display: flex; align-items: center; gap: 10px; padding: 7px 9px;
    border-radius: var(--radius-sm); color: var(--surface-fg); font-size: 0.84rem;
  }
  .size-row:hover { background: var(--surface-raised); }
  .size-row.on { background: var(--accent-soft); color: var(--accent); }
  .size-row .dot { width: 30px; border-radius: 999px; min-height: 1px; flex-shrink: 0; }
  .size-name { flex: 1; text-align: left; }

  .colors { width: 184px; }

  .add { display: flex; flex-direction: column; gap: 2px; min-width: 130px; }
  .add button {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px;
    border-radius: var(--radius-sm); color: var(--surface-fg); font-size: 0.86rem; text-align: left;
  }
  .add button:hover { background: var(--surface-raised); }
  .add button i { font-size: 1.05rem; color: var(--surface-fg-muted); }
</style>
