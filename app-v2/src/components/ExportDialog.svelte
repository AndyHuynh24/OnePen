<script lang="ts">
  // Export dialog — save the current note as PNG or PDF (continuous / A4), with
  // a grid toggle. Opened from the toolbar.
  import { note } from '$stores/note.svelte';
  import { toast } from '$stores/toast.svelte';
  import { exportPng, exportPdf } from '$lib/export';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let includeGrid = $state(false);
  let busy = $state(false);

  async function run(fn: () => Promise<boolean>) {
    if (busy) return;
    busy = true;
    try {
      const ok = await fn();
      if (ok) {
        toast.show('Exported', 'bx-check');
        open = false;
      } else {
        toast.show('Nothing to export', 'bx-info-circle');
      }
    } catch (err) {
      console.error('[export] failed:', err);
      toast.show('Export failed', 'bx-error');
    } finally {
      busy = false;
    }
  }

  const opts = $derived({ includeGrid });
</script>

{#if open}
  <div class="backdrop" onclick={() => (open = false)} role="presentation"></div>
  <div class="dialog" role="dialog" aria-label="Export note">
    <header>
      <span><i class="bx bx-export"></i> Export</span>
      <button class="x" onclick={() => (open = false)} aria-label="Close"><i class="bx bx-x"></i></button>
    </header>

    {#if !note.path && note.groups.length === 0}
      <p class="empty">Open a note with content to export.</p>
    {:else}
      <label class="grid-opt">
        <input type="checkbox" bind:checked={includeGrid} />
        Include grid background
      </label>

      <div class="opts">
        <button class="opt" disabled={busy} onclick={() => run(() => exportPng(opts))}>
          <i class="bx bx-image"></i>
          <span class="t">PNG image</span>
          <span class="d">A single picture of the note</span>
        </button>
        <button class="opt" disabled={busy} onclick={() => run(() => exportPdf('continuous', opts))}>
          <i class="bx bx-file-blank"></i>
          <span class="t">PDF — continuous</span>
          <span class="d">One long page, fits the content</span>
        </button>
        <button class="opt" disabled={busy} onclick={() => run(() => exportPdf('a4', opts))}>
          <i class="bx bxs-file-pdf"></i>
          <span class="t">PDF — A4 pages</span>
          <span class="d">Paginated for printing</span>
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 160; background: var(--scrim-strong);
    animation: fade var(--dur-fast) var(--ease-out);
  }
  @keyframes fade { from { opacity: 0; } }
  .dialog {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 161;
    width: min(360px, 92vw);
    background: var(--surface-panel); border: 1px solid var(--border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 16px;
    font-family: var(--font-ui); animation: pop var(--dur-base) var(--ease-out);
  }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -47%) scale(0.97); } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  header span { display: flex; align-items: center; gap: 8px; font-size: 1rem; font-weight: 600; color: var(--surface-fg); }
  header i { color: var(--surface-fg); }
  .x { width: 30px; height: 30px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .x:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .empty { padding: 16px 4px; color: var(--surface-fg-muted); font-size: 0.88rem; }

  .grid-opt { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.85rem; color: var(--surface-fg-muted); }

  .opts { display: flex; flex-direction: column; gap: 8px; }
  .opt {
    display: grid; grid-template-columns: 28px 1fr; grid-template-rows: auto auto;
    column-gap: 12px; align-items: center;
    padding: 12px; border-radius: var(--radius-md); text-align: left;
    background: var(--surface-bg); border: 1px solid var(--border);
  }
  .opt:hover:not(:disabled) { border-color: var(--accent); background: var(--surface-raised); }
  .opt:disabled { opacity: 0.5; }
  .opt i { grid-row: 1 / 3; font-size: 1.5rem; color: var(--surface-fg-muted); }
  .opt .t { font-size: 0.9rem; font-weight: 600; color: var(--surface-fg); }
  .opt .d { font-size: 0.76rem; color: var(--surface-fg-muted); }
</style>
