<script lang="ts">
  import { note } from '$stores/note.svelte';
  import { saveState } from '$stores/save.svelte';

  // Derive what to show. When no note is open but the canvas has content, warn
  // the user that there's nowhere to save (a common cause of "autosave doesn't
  // work" — you're drawing on the blank canvas, not inside a note).
  const view = $derived.by(() => {
    if (!note.path) {
      if (note.groups.length > 0) {
        return { icon: 'bx-error-circle', text: 'No note open — open one to save', cls: 'warn' };
      }
      return null;
    }
    switch (saveState.status) {
      case 'saving':
        return { icon: 'bx-sync bx-spin', text: 'Saving…', cls: 'busy' };
      case 'saved':
        return { icon: 'bx-check-circle', text: 'Saved', cls: 'ok' };
      case 'dirty':
        return { icon: 'bx-edit', text: 'Unsaved changes', cls: 'dirty' };
      case 'error':
        return { icon: 'bx-error', text: 'Save failed — retrying', cls: 'err' };
      default:
        return { icon: 'bx-cloud', text: 'Saved', cls: 'ok' };
    }
  });

  // which note is open — shown as a label beneath the status pill
  const openNote = $derived.by(() => {
    if (!note.path) return null;
    const parts = note.path.replace(/\.json$/i, '').split('/');
    const name = parts.pop() ?? '';
    return { name, folder: parts.join('/') };
  });
</script>

{#if view || openNote}
  <div class="stack">
    {#if view}
      <div class="save-indicator {view.cls}">
        <i class="bx {view.icon}"></i>
        <span>{view.text}</span>
      </div>
    {/if}
    {#if openNote}
      <div class="open-note" title={note.path}>
        <i class="bx bx-file-blank"></i>
        {#if openNote.folder}<span class="folder">{openNote.folder}</span><span class="sep">/</span>{/if}
        <span class="name">{openNote.name}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .stack {
    position: fixed;
    bottom: 14px;
    right: 16px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    pointer-events: none;
    font-family: var(--font-ui);
  }
  .save-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    /* solid, not backdrop-blur (re-blurs the canvas every stroke frame → lag) */
    background: var(--surface-panel);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--surface-fg-muted);
    transition: color var(--dur-base) var(--ease-out);
  }
  .save-indicator i {
    font-size: 0.95rem;
  }

  /* which note is open */
  .open-note {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: min(48vw, 320px);
    padding: 5px 11px;
    border-radius: var(--radius-pill);
    /* solid, not backdrop-blur (re-blurs the canvas every stroke frame → lag) */
    background: var(--surface-panel);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    font-size: 0.74rem;
    color: var(--surface-fg-muted);
    white-space: nowrap;
    overflow: hidden;
  }
  .open-note i { font-size: 0.9rem; color: var(--surface-fg-subtle); flex-shrink: 0; }
  .open-note .folder { color: var(--surface-fg-subtle); overflow: hidden; text-overflow: ellipsis; }
  .open-note .sep { color: var(--surface-fg-subtle); flex-shrink: 0; }
  .open-note .name { color: var(--surface-fg); font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .ok {
    color: var(--success);
  }
  .busy {
    color: var(--accent);
  }
  .dirty {
    color: var(--surface-fg-subtle);
  }
  .warn,
  .err {
    color: var(--warning);
  }
</style>
