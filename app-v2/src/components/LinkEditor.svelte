<script lang="ts">
  // Link URL editor — a small popup shown when a link annotation is created or
  // tapped without a URL set. The annotation is anchored to its strokes; this
  // just captures/edits the URL. Tapping a link that HAS a URL opens the embed
  // directly (handled in the pointer layer), not here.
  import { note } from '$stores/note.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { annot } from '$stores/annot.svelte';
  import { embed } from '$stores/embed.svelte';
  import { history } from '$stores/history.svelte';
  import { markDirty } from '$persistence/autosave';
  import { normalizeUrl } from '$lib/url';
  import type { Group } from '$types/group';

  const group = $derived.by<Group | null>(() => {
    if (annot.linkEditId === null) return null;
    const g = note.view(annot.linkEditId);
    return g && g.type === 'link' ? g : null;
  });

  const pos = $derived.by(() => {
    const g = group;
    if (!g) return { x: 0, y: 0 };
    const sx = (g.bbox.x - viewport.offset.x) * viewport.scale;
    const sy = (g.bbox.y - viewport.offset.y) * viewport.scale;
    return {
      x: Math.max(10, Math.min(sx, window.innerWidth - 290)),
      y: Math.max(10, Math.min(sy + g.bbox.h * viewport.scale + 10, window.innerHeight - 150)),
    };
  });

  // typing a URL is one undo step per editing session, not one per keystroke
  let urlCapturedFor: number | null = null;
  $effect(() => {
    if (annot.linkEditId === null) urlCapturedFor = null;
  });

  function setUrl(e: Event) {
    const g = group;
    if (!g) return;
    if (urlCapturedFor !== g.id) {
      history.capture();
      urlCapturedFor = g.id;
    }
    g.url = (e.target as HTMLInputElement).value;
    note.commit();
    markDirty();
  }
  function openNow() {
    const g = group;
    if (!g || !g.url?.trim()) return;
    g.url = normalizeUrl(g.url);
    note.commit();
    markDirty();
    annot.closeLink();
    embed.show(g.id);
  }
  function attachFile(e: Event) {
    const g = group;
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!g || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      history.capture();
      g.fileData = reader.result as string;
      g.fileName = file.name;
      g.fileType = file.type;
      note.commit();
      markDirty();
      annot.closeLink();
      embed.show(g.id); // open the window straight away
    };
    reader.readAsDataURL(file);
  }
  function del() {
    const g = group;
    if (!g) return;
    history.capture();
    note.setGroups(note.groups.filter((x) => x.id !== g.id));
    markDirty();
    annot.closeLink();
  }
  function close() {
    // a freshly-created link with neither URL nor file is an orphan — remove it
    const g = group;
    if (g && !g.url?.trim() && !g.fileData) {
      note.setGroups(note.groups.filter((x) => x.id !== g.id));
      markDirty();
    }
    annot.closeLink();
  }

  let input: HTMLInputElement | null = $state(null);
  $effect(() => {
    if (group && input) input.focus();
  });
</script>

{#if group}
  {@const g = group}
  <div class="le" style="left: {pos.x}px; top: {pos.y}px;">
    <header>
      <span><i class="bx bx-link"></i> Link</span>
      <button class="x" onclick={close} aria-label="Done"><i class="bx bx-check"></i></button>
    </header>

    <input
      bind:this={input}
      type="url"
      inputmode="url"
      value={g.url ?? ''}
      oninput={setUrl}
      onkeydown={(e) => e.key === 'Enter' && openNow()}
      placeholder="Paste a URL (youtube.com, …)"
    />

    {#if g.fileName}
      <div class="file"><i class="bx bx-paperclip"></i> {g.fileName}</div>
    {/if}

    <div class="row">
      <button class="open" onclick={openNow} disabled={!g.url?.trim()}>
        <i class="bx bx-link-external"></i> Open
      </button>
      <label class="attach" title="Attach a file (slide, PDF, image)">
        <i class="bx bx-paperclip"></i>
        <input type="file" accept="image/*,application/pdf" onchange={attachFile} hidden />
      </label>
      <button class="del" onclick={del} aria-label="Delete link"><i class="bx bx-trash"></i></button>
    </div>
  </div>
{/if}

<style>
  .le {
    position: fixed;
    width: 280px;
    z-index: 140;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 12px;
    font-family: var(--font-ui);
    animation: leIn var(--dur-fast) var(--ease-out);
  }
  @keyframes leIn { from { opacity: 0; transform: translateY(-6px); } }
  header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px; font-size: 0.78rem; font-weight: 600; color: var(--surface-fg-muted);
  }
  header span { display: flex; align-items: center; gap: 6px; }
  .x { width: 26px; height: 26px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .x:hover { background: var(--surface-raised); color: var(--surface-fg); }
  input {
    width: 100%;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-bg);
    color: var(--surface-fg);
    font-family: var(--font-ui);
    font-size: 0.9rem;
  }
  input:focus { outline: none; border-color: var(--accent); }
  .row { display: flex; gap: 8px; margin-top: 10px; }
  .open {
    flex: 1;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 9px; border-radius: var(--radius-md);
    background: var(--accent); color: var(--accent-fg);
    font-size: 0.85rem; font-weight: 500;
  }
  .open:disabled { opacity: 0.45; }
  .attach {
    width: 42px; display: grid; place-items: center; border-radius: var(--radius-md);
    color: var(--surface-fg); border: 1px solid var(--border-strong); cursor: pointer;
  }
  .attach:hover { background: var(--surface-raised); }
  .file {
    display: flex; align-items: center; gap: 6px; margin-top: 8px;
    font-size: 0.78rem; color: var(--surface-fg-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .del {
    width: 42px; display: grid; place-items: center; border-radius: var(--radius-md);
    color: var(--danger); border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  }
  .del:hover { background: color-mix(in oklab, var(--danger) 14%, transparent); }
</style>
