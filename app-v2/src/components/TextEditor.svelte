<script lang="ts">
  // Text block editor popup. Live-updates the group as you type/change styles.
  import { tick } from 'svelte';
  import { note } from '$stores/note.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { editor } from '$stores/editor.svelte';
  import { recalcTextBbox, finalizeText, cancelText, TEXT_FONTS } from '$tools/text';
  import { markDirty } from '$persistence/autosave';
  import type { Group } from '$types/group';
  import ColorField from './ColorField.svelte';

  let textarea: HTMLTextAreaElement | undefined = $state();

  const group = $derived.by<Group | null>(() => {
    return note.view(editor.editingId);
  });

  // Position the popup just below the text block, clamped to the screen.
  const pos = $derived.by(() => {
    const g = group;
    if (!g) return { x: 0, y: 0 };
    const sx = (g.bbox.x - viewport.offset.x) * viewport.scale;
    const sy = (g.bbox.y - viewport.offset.y) * viewport.scale;
    const x = Math.max(10, Math.min(sx, window.innerWidth - 280));
    const y = Math.max(10, Math.min(sy + g.bbox.h * viewport.scale + 10, window.innerHeight - 320));
    return { x, y };
  });

  $effect(() => {
    if (group && textarea) {
      void editor.editingId;
      tick().then(() => {
        textarea?.focus();
        textarea?.select();
      });
    }
  });

  function touch() {
    note.commit();
    markDirty();
  }

  function onText(e: Event) {
    const g = group;
    if (!g) return;
    g.text = (e.target as HTMLTextAreaElement).value;
    recalcTextBbox(g);
    touch();
  }
  function onFont(e: Event) {
    const g = group;
    if (!g) return;
    g.fontFamily = (e.target as HTMLSelectElement).value;
    recalcTextBbox(g);
    touch();
  }
  function onSize(e: Event) {
    const g = group;
    if (!g) return;
    g.fontSize = Number((e.target as HTMLInputElement).value) || 24;
    recalcTextBbox(g);
    touch();
  }
  function onColor(c: string) {
    const g = group;
    if (!g) return;
    g.color = c;
    touch();
  }
  function onAlign(a: 'left' | 'center' | 'right') {
    const g = group;
    if (!g) return;
    g.textAlign = a;
    touch();
  }

  // Done → split into character-strokes + drop into a placement box.
  function done() {
    const g = group;
    if (!g) return;
    if ((g.text ?? '').trim()) finalizeText(g);
    else cancelText(g);
  }

  // Cancel → discard the text block entirely.
  function del() {
    const g = group;
    if (g) cancelText(g);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      del();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      done();
    }
  }
</script>

{#if group}
  {@const g = group}
  <div class="te" style="left: {pos.x}px; top: {pos.y}px;">
    <header>
      <span>Edit text</span>
      <button class="x" onclick={done} aria-label="Done"><i class="bx bx-check"></i></button>
    </header>

    <textarea
      bind:this={textarea}
      value={g.text ?? ''}
      placeholder="Type text…"
      oninput={onText}
      onkeydown={onKey}
      style="font-family: '{g.fontFamily}', sans-serif;"
    ></textarea>

    <div class="row">
      <select value={g.fontFamily} onchange={onFont} aria-label="Font">
        {#each TEXT_FONTS as f (f)}<option value={f}>{f}</option>{/each}
      </select>
      <input
        class="size"
        type="number"
        min="12"
        max="72"
        value={g.fontSize}
        oninput={onSize}
        aria-label="Font size"
      />
      <ColorField value={g.color} label="Text color" onchange={onColor} />
    </div>

    <div class="row aligns">
      {#each ['left', 'center', 'right'] as const as a (a)}
        <button
          class:active={(g.textAlign ?? 'left') === a}
          onclick={() => onAlign(a)}
          aria-label={`Align ${a}`}
        >
          <i class="bx bx-align-{a === 'center' ? 'middle' : a}"></i>
        </button>
      {/each}
      <span class="spacer"></span>
      <button class="del" onclick={del} aria-label="Delete text"><i class="bx bx-trash"></i></button>
    </div>
  </div>
{/if}

<style>
  .te {
    position: fixed;
    width: 268px;
    z-index: 130;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 12px;
    font-family: var(--font-ui);
    animation: teIn var(--dur-fast) var(--ease-out);
  }
  @keyframes teIn {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--surface-fg-muted);
  }
  .x {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    color: var(--surface-fg-muted);
  }
  .x:hover {
    background: var(--surface-raised);
    color: var(--surface-fg);
  }
  textarea {
    width: 100%;
    height: 76px;
    resize: vertical;
    padding: 8px 10px;
    background: var(--surface-sunken);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--surface-fg);
    font-size: 0.95rem;
  }
  textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  select {
    flex: 1;
    padding: 7px 8px;
    background: var(--surface-sunken);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--surface-fg);
    font-size: 0.85rem;
  }
  .size {
    width: 52px;
    padding: 7px 6px;
    background: var(--surface-sunken);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--surface-fg);
    font-size: 0.85rem;
    text-align: center;
  }
  .aligns button {
    width: 34px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    color: var(--surface-fg-muted);
  }
  .aligns button:hover {
    background: var(--surface-raised);
    color: var(--surface-fg);
  }
  .aligns button.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .spacer {
    flex: 1;
  }
  .del {
    width: 34px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    color: var(--danger);
  }
  .del:hover {
    background: color-mix(in oklab, var(--danger) 14%, transparent);
  }
  .aligns button i,
  .del i {
    font-size: 1.05rem;
  }
</style>
