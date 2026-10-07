<script lang="ts">
  // Floating embedded window — opened by tapping a link annotation. It is a
  // MOVABLE, non-modal popup (no backdrop): you can park it anywhere and keep
  // drawing / taking notes underneath (e.g. lesson slides alongside notes).
  // Shows an attached file (image / PDF) if present, otherwise the URL in an
  // iframe (with an "open in new tab" fallback, since many sites block framing).
  import { note } from '$stores/note.svelte';
  import { embed } from '$stores/embed.svelte';
  import { embedUrl, hostOf, normalizeUrl } from '$lib/url';
  import type { Group } from '$types/group';

  const link = $derived.by<Group | null>(() => {
    if (embed.linkId === null) return null;
    const g = note.view(embed.linkId);
    return g && g.type === 'link' ? g : null;
  });

  const kind = $derived.by<'file-image' | 'file-pdf' | 'file-other' | 'url' | 'empty'>(() => {
    const g = link;
    if (!g) return 'empty';
    if (g.fileData) {
      const t = g.fileType ?? '';
      if (t.startsWith('image/')) return 'file-image';
      if (t === 'application/pdf') return 'file-pdf';
      return 'file-other';
    }
    if (g.url?.trim()) return 'url';
    return 'empty';
  });

  const src = $derived(link?.url ? embedUrl(link.url) : '');
  const title = $derived(link?.fileName || (link?.url ? hostOf(link.url) : 'Link'));

  // window position + size (screen px) — initialized near the link on open
  let win = $state({ x: 0, y: 0, w: 720, h: 520 });
  let placed = $state<number | null>(null);
  $effect(() => {
    const g = link;
    if (g && placed !== g.id) {
      placed = g.id;
      win = {
        x: Math.max(12, Math.min(window.innerWidth - 740, window.innerWidth / 2 - 360)),
        y: Math.max(12, window.innerHeight / 2 - 260),
        w: Math.min(720, window.innerWidth - 24),
        h: Math.min(520, window.innerHeight - 24),
      };
    }
    if (!g) placed = null;
  });

  // drag the window by its header
  type Drag = { kind: 'move' | 'resize'; px: number; py: number; ox: number; oy: number; ow: number; oh: number };
  let drag: Drag | null = null;
  function onMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;
    if (drag.kind === 'move') {
      win = {
        ...win,
        x: Math.max(0, Math.min(window.innerWidth - 80, drag.ox + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, drag.oy + dy)),
      };
    } else {
      win = {
        ...win,
        w: Math.max(280, Math.min(window.innerWidth - win.x - 4, drag.ow + dx)),
        h: Math.max(200, Math.min(window.innerHeight - win.y - 4, drag.oh + dy)),
      };
    }
  }
  function onUp() {
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  function startMove(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    drag = { kind: 'move', px: e.clientX, py: e.clientY, ox: win.x, oy: win.y, ow: win.w, oh: win.h };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function startResize(e: PointerEvent) {
    e.stopPropagation();
    drag = { kind: 'resize', px: e.clientX, py: e.clientY, ox: win.x, oy: win.y, ow: win.w, oh: win.h };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function close() {
    embed.close();
  }
  function openTab() {
    if (link?.url) window.open(normalizeUrl(link.url), '_blank', 'noopener');
    else if (link?.fileData) window.open(link.fileData, '_blank', 'noopener');
  }
</script>

{#if link}
  {@const g = link}
  <div class="win" style="left:{win.x}px; top:{win.y}px; width:{win.w}px; height:{win.h}px;" role="dialog" aria-label="Embedded window">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header onpointerdown={startMove} role="toolbar" tabindex="-1" aria-label="Window title bar — drag to move">
      <i class="bx {g.fileData ? 'bx-file' : 'bx-globe'}"></i>
      <span class="title">{title}</span>
      <button class="hbtn" onclick={openTab} title="Open in new tab"><i class="bx bx-link-external"></i></button>
      <button class="hbtn" onclick={close} title="Close"><i class="bx bx-x"></i></button>
    </header>

    <div class="body">
      {#if kind === 'file-image'}
        <img src={g.fileData} alt={g.fileName ?? 'attachment'} />
      {:else if kind === 'file-pdf'}
        <iframe title={g.fileName ?? 'PDF'} src={g.fileData}></iframe>
      {:else if kind === 'file-other'}
        <div class="fallback-full">
          <i class="bx bx-file"></i>
          <p>{g.fileName}</p>
          <button onclick={openTab}>Open file</button>
        </div>
      {:else if kind === 'url'}
        <iframe
          title="Embedded page"
          {src}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerpolicy="no-referrer"
        ></iframe>
        <div class="fallback">
          Can't show this page here?
          <button onclick={openTab}>Open in a new tab</button>
        </div>
      {:else}
        <div class="fallback-full"><i class="bx bx-link"></i><p>No URL or file attached.</p></div>
      {/if}
    </div>

    <button class="resize" onpointerdown={startResize} aria-label="Resize"><i class="bx bx-chevron-down-square"></i></button>
  </div>
{/if}

<style>
  /* NO backdrop — the window floats over the canvas so you can keep drawing. */
  .win {
    position: fixed;
    z-index: 130;
    display: flex; flex-direction: column;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    font-family: var(--font-ui);
    animation: pop var(--dur-fast) var(--ease-out);
  }
  @keyframes pop { from { opacity: 0; transform: scale(0.98); } }
  header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--divider);
    color: var(--surface-fg);
    cursor: move;
    touch-action: none;
    user-select: none;
  }
  header i { color: var(--surface-fg); }
  .title { flex: 1; font-size: 0.85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hbtn { width: 30px; height: 30px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .hbtn:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .body { flex: 1; position: relative; display: flex; flex-direction: column; min-height: 0; background: #fff; }
  iframe { flex: 1; width: 100%; border: 0; background: #fff; }
  img { flex: 1; width: 100%; object-fit: contain; min-height: 0; background: #1a1a1a; }
  .fallback {
    padding: 8px 12px; font-size: 0.8rem; color: var(--surface-fg-muted);
    border-top: 1px solid var(--divider); display: flex; gap: 8px; align-items: center; justify-content: center;
    background: var(--surface-panel);
  }
  .fallback button, .fallback-full button { color: var(--accent); font-weight: 600; }
  .fallback button:hover { text-decoration: underline; }
  .fallback-full {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    color: var(--surface-fg-muted); background: var(--surface-panel);
  }
  .fallback-full i { font-size: 2.4rem; color: var(--surface-fg-subtle); }
  .fallback-full button {
    padding: 8px 16px; border-radius: var(--radius-md); background: var(--accent); color: var(--accent-fg); font-weight: 500;
  }
  .resize {
    position: absolute; right: 2px; bottom: 2px;
    width: 22px; height: 22px; display: grid; place-items: center;
    color: var(--surface-fg-subtle); cursor: nwse-resize; touch-action: none;
  }
  .resize:hover { color: var(--surface-fg); }
</style>
