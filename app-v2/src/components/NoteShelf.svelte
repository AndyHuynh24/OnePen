<script lang="ts">
  // Notebook shelf — closed notebooks are horizontal colored bars stacked in a
  // pile. Clicking one "opens" it: the bar rotates from horizontal to a vertical
  // spine docked on the left, and its notes unfurl inline beside it. The spine
  // stays as the section indicator. Clicking again reverses the animation.
  import { onMount } from 'svelte';
  import { note } from '$stores/note.svelte';
  import { ui } from '$stores/ui.svelte';
  import { notebook } from '$stores/notebook.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { history } from '$stores/history.svelte';
  import { theme } from '$stores/theme.svelte';
  import { modal } from '$stores/prompt.svelte';
  import {
    createFolder,
    createNote,
    deleteFolder,
    deleteNote,
    listFolders,
    listNotesInFolder,
    loadNote,
    nameOf,
    renameFolder,
    renameNote,
  } from '$persistence/notes';
  import { flushNow } from '$persistence/autosave';
  import { deleteSetting, setSetting, SETTING_KEYS } from '$persistence/settings';
  import { colorAt, PALETTE_SIZE } from '$lib/notebookColor';
  import { notebookColors } from '$stores/notebookColors.svelte';

  // Which notebook is currently expanded (open). Independent of which note is
  // active so the canvas keeps showing a note even if you collapse its book.
  let expanded = $state<string | null>(null);

  // Floating rename/delete action menu.
  type MenuRequest =
    | { kind: 'folder'; name: string }
    | { kind: 'note'; path: string; folder: string };
  type ActionMenu = MenuRequest & { x: number; y: number };
  let menu = $state<ActionMenu | null>(null);
  // when set to a folder name, the menu shows the color palette instead of items
  let colorPickerFor = $state<string | null>(null);
  const COLOR_INDICES = Array.from({ length: PALETTE_SIZE }, (_, i) => i);

  function openMenu(e: MouseEvent, m: MenuRequest) {
    e.stopPropagation();
    colorPickerFor = null;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { ...m, x: r.right + 6, y: r.top };
  }
  function closeMenu() {
    menu = null;
    colorPickerFor = null;
  }
  function pickFolderColor(name: string, index: number) {
    notebookColors.setOverride(name, index);
    closeMenu();
  }
  function resetFolderColor(name: string) {
    notebookColors.clearOverride(name);
    closeMenu();
  }

  async function renameFolderAction(name: string) {
    closeMenu();
    const next = await modal.prompt({
      title: 'Rename notebook',
      label: 'New name',
      defaultValue: name,
      confirmText: 'Rename',
    });
    if (!next || next === name) return;
    await renameFolder(name, next);
    notebookColors.rename(name, next); // keep the custom color with the notebook
    if (ui.selectedFolder === name) ui.selectFolder(next);
    if (expanded === name) {
      expanded = next;
      notebook.setNotesInFolder(await listNotesInFolder(next));
    }
    await refreshFolders();
  }

  async function deleteFolderAction(name: string) {
    closeMenu();
    const ok = await modal.confirm({
      title: `Delete “${name}”?`,
      body: 'This permanently deletes the notebook and all notes inside it.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const openNoteInFolder = note.path?.startsWith(`${name}/`);
    await deleteFolder(name);
    notebookColors.clearOverride(name);
    if (expanded === name) expanded = null;
    if (openNoteInFolder) {
      note.close();
      history.clear();
      await deleteSetting(SETTING_KEYS.LAST_SAVE_NOTE);
    }
    await refreshFolders();
  }

  async function renameNoteAction(path: string, folder: string) {
    closeMenu();
    const current = nameOf(path).replace(/\.json$/, '');
    const next = await modal.prompt({
      title: 'Rename note',
      label: 'New name',
      defaultValue: current,
      confirmText: 'Rename',
    });
    if (!next || next === current) return;
    const newPath = await renameNote(path, next);
    if (note.path === path) {
      // keep the open note pointed at its new path
      note.set(note.groups, newPath, note.isSummary);
      await setSetting(SETTING_KEYS.LAST_SAVE_NOTE, { path: newPath });
    }
    notebook.setNotesInFolder(await listNotesInFolder(folder));
    await refreshFolders();
  }

  async function deleteNoteAction(path: string, folder: string) {
    closeMenu();
    const name = nameOf(path).replace(/\.json$/, '');
    const ok = await modal.confirm({
      title: `Delete “${name}”?`,
      body: 'This permanently deletes the note.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteNote(path);
    if (note.path === path) {
      note.close();
      history.clear();
      await deleteSetting(SETTING_KEYS.LAST_SAVE_NOTE);
    }
    notebook.setNotesInFolder(await listNotesInFolder(folder));
    await refreshFolders();
  }

  async function refreshFolders() {
    notebook.setFolders(await listFolders());
  }

  async function toggleBook(name: string) {
    if (expanded === name) {
      expanded = null;
      return;
    }
    expanded = name;
    ui.selectFolder(name);
    notebook.setLoading(true);
    notebook.setNotesInFolder(await listNotesInFolder(name));
    notebook.setLoading(false);
  }

  async function openNote(path: string) {
    if (note.path && note.dirty) await flushNow();
    const rec = await loadNote(path);
    if (!rec) return;
    history.clear();
    note.set(rec.content, rec.path, !!rec.isSummaryNote);
    viewport.reset();
    await setSetting(SETTING_KEYS.LAST_SAVE_NOTE, { path });
  }

  async function newFolder() {
    const name = await modal.prompt({
      title: 'New notebook',
      label: 'Notebook name',
      placeholder: 'e.g. Calculus, Recipes, Journal',
      confirmText: 'Create notebook',
    });
    if (!name) return;
    try {
      await createFolder(name);
      await refreshFolders();
      await toggleBook(name);
    } catch (err) {
      console.error('[shelf] createFolder failed:', err);
    }
  }

  async function newNote(folder: string) {
    const name = await modal.prompt({
      title: 'New note',
      label: `Note in ${folder}`,
      placeholder: 'e.g. Lecture 03, Week of Mar 12',
      confirmText: 'Create note',
    });
    if (!name) return;
    try {
      const path = await createNote(folder, name);
      notebook.setNotesInFolder(await listNotesInFolder(folder));
      await refreshFolders();
      await openNote(path);
    } catch (err) {
      console.error('[shelf] createNote failed:', err);
    }
  }

  function fmtDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  onMount(async () => {
    await refreshFolders();
    // restore expanded state from the active note's folder, if any
    if (ui.selectedFolder) {
      expanded = ui.selectedFolder;
      notebook.setNotesInFolder(await listNotesInFolder(ui.selectedFolder));
    }
  });
</script>

<aside class="shelf" class:open={ui.navOpen}>
  <header>
    <button class="title-btn" onclick={() => ui.toggleNav(false)} title="Close">
      <i class="bx bx-chevron-left"></i>
      <span>Notebooks</span>
    </button>
    <button class="add" onclick={newFolder} title="New notebook">
      <i class="bx bx-plus"></i>
    </button>
  </header>

  <div class="pile">
    {#if notebook.folders.length === 0}
      <button class="empty-stack" onclick={newFolder}>
        <div class="ghost-cover"><i class="bx bx-plus-circle"></i></div>
        <span>Create your first notebook</span>
      </button>
    {:else}
      {#each notebook.folders as f, i (f.name)}
        {@const c = colorAt(notebookColors.indexFor(f.name), theme.current)}
        {@const isOpen = expanded === f.name}
        <div
          class="book"
          class:open={isOpen}
          style="
            --spine: {c.spine};
            --cover: {c.cover};
            --cover-soft: {c.coverSoft};
            --ink: {c.ink};
            --i: {i};
          "
        >
          <!-- The bar: horizontal when closed, rotates to a vertical spine when open -->
          <button class="bar" onclick={() => toggleBook(f.name)} title={f.name}>
            <span class="bar-label">{f.name}</span>
            <span class="bar-meta">
              {#if !isOpen}{f.noteCount} {f.noteCount === 1 ? 'note' : 'notes'}{/if}
            </span>
            <i class="bar-chevron bx {isOpen ? 'bx-chevron-down' : 'bx-chevron-right'}"></i>
          </button>
          {#if !isOpen}
            <button
              class="book-kebab"
              title="Notebook options"
              aria-label="Notebook options"
              onclick={(e) => openMenu(e, { kind: 'folder', name: f.name })}
            >
              <i class="bx bx-dots-vertical-rounded"></i>
            </button>
          {/if}

          <!-- The notes drawer: unfurls beside the vertical spine -->
          <div class="drawer">
            <div class="drawer-inner">
              {#if notebook.loading && isOpen}
                <p class="empty">Loading…</p>
              {:else if isOpen && notebook.notesInFolder.length === 0}
                <button class="empty-cta" onclick={() => newNote(f.name)}>
                  <i class="bx bx-edit-alt"></i>
                  <span>Write your first note</span>
                </button>
              {:else if isOpen}
                {#each notebook.notesInFolder as n (n.path)}
                  <div class="note-row">
                    <button
                      class="note"
                      class:active={note.path === n.path}
                      class:summary={n.isSummaryNote}
                      onclick={() => openNote(n.path)}
                    >
                      <i class="bx {n.isSummaryNote ? 'bx-list-ul' : 'bx-edit-alt'}"></i>
                      <span class="note-name">{nameOf(n.path).replace(/\.json$/, '')}</span>
                      <span class="date">{fmtDate(n.createdAt)}</span>
                    </button>
                    <button
                      class="note-kebab"
                      title="Note options"
                      aria-label="Note options"
                      onclick={(e) => openMenu(e, { kind: 'note', path: n.path, folder: f.name })}
                    >
                      <i class="bx bx-dots-vertical-rounded"></i>
                    </button>
                  </div>
                {/each}
                <button class="note add-note" onclick={() => newNote(f.name)}>
                  <i class="bx bx-plus"></i>
                  <span class="note-name">New note</span>
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</aside>

{#if menu}
  {@const m = menu}
  <div
    class="menu-backdrop"
    role="presentation"
    onclick={closeMenu}
    oncontextmenu={(e) => {
      e.preventDefault();
      closeMenu();
    }}
  ></div>
  <div class="action-menu" style="left: {m.x}px; top: {m.y}px;">
    {#if m.kind === 'folder'}
      {#if colorPickerFor === m.name}
        <div class="swatch-grid">
          {#each COLOR_INDICES as idx (idx)}
            {@const sc = colorAt(idx, theme.current)}
            <button
              class="color-dot"
              class:on={notebookColors.indexFor(m.name) === idx}
              style="background: {sc.spine}"
              aria-label="Color {idx + 1}"
              onclick={() => pickFolderColor(m.name, idx)}
            ></button>
          {/each}
        </div>
        {#if notebookColors.hasOverride(m.name)}
          <button onclick={() => resetFolderColor(m.name)}>
            <i class="bx bx-reset"></i> Reset to default
          </button>
        {/if}
      {:else}
        <button onclick={() => renameFolderAction(m.name)}>
          <i class="bx bx-rename"></i> Rename notebook
        </button>
        <button onclick={() => (colorPickerFor = m.name)}>
          <i class="bx bx-palette"></i> Change color
        </button>
        <button class="danger" onclick={() => deleteFolderAction(m.name)}>
          <i class="bx bx-trash"></i> Delete notebook
        </button>
      {/if}
    {:else}
      <button onclick={() => renameNoteAction(m.path, m.folder)}>
        <i class="bx bx-rename"></i> Rename note
      </button>
      <button class="danger" onclick={() => deleteNoteAction(m.path, m.folder)}>
        <i class="bx bx-trash"></i> Delete note
      </button>
    {/if}
  </div>
{/if}

<style>
  /* ── rename/delete affordances ─────────────────────────────────────────── */
  .book-kebab {
    position: absolute;
    top: 9px;
    right: 8px;
    z-index: 20; /* above the bar button so taps hit the kebab, not the bar */
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    color: var(--ink);
    opacity: 0.55;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      background var(--dur-fast) var(--ease-out);
  }
  .book-kebab:hover {
    opacity: 1;
    background: color-mix(in oklab, var(--cover) 70%, black);
  }
  .book-kebab i {
    font-size: 1.15rem;
  }

  .note-row {
    position: relative;
    display: flex;
    align-items: center;
  }
  .note-row .note {
    flex: 1;
    padding-right: 30px; /* room for the kebab */
  }
  .note-kebab {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    color: var(--page-ink-muted);
    opacity: 0;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      background var(--dur-fast) var(--ease-out);
  }
  .note-row:hover .note-kebab,
  .note-kebab:hover {
    opacity: 1;
  }
  .note-kebab:hover {
    background: var(--page-raised);
    color: var(--page-ink);
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 110;
  }
  .action-menu {
    position: fixed;
    z-index: 111;
    min-width: 168px;
    padding: 6px;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: var(--font-ui);
    animation: menuIn var(--dur-fast) var(--ease-out);
  }
  @keyframes menuIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .action-menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border-radius: var(--radius-sm);
    color: var(--surface-fg);
    font-size: 0.85rem;
    text-align: left;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .action-menu button:hover {
    background: var(--surface-raised);
  }
  .action-menu button i {
    font-size: 1.05rem;
    color: var(--surface-fg-muted);
  }
  .action-menu button.danger {
    color: var(--danger);
  }
  .action-menu button.danger i {
    color: var(--danger);
  }
  .action-menu button.danger:hover {
    background: color-mix(in oklab, var(--danger) 14%, transparent);
  }

  /* notebook color picker (shown inline in the menu) */
  .action-menu .swatch-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px;
    padding: 4px 4px 8px;
  }
  .action-menu .color-dot {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid color-mix(in oklab, black 18%, transparent);
    transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast);
  }
  .action-menu .color-dot:hover {
    transform: scale(1.12);
  }
  .action-menu .color-dot.on {
    box-shadow: 0 0 0 2px var(--surface-panel), 0 0 0 4px var(--accent);
  }

  .shelf {
    position: fixed;
    inset: 0 auto 0 0;
    width: 320px;
    background: color-mix(in oklab, var(--surface-panel) 96%, transparent);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    border-right: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    z-index: 80;
    display: flex;
    flex-direction: column;
    transform: translateX(-100%);
    transition: transform var(--dur-base) var(--ease-out);
    font-family: var(--font-ui);
  }
  .shelf.open {
    transform: translateX(0);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--divider);
  }
  .title-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--surface-fg);
    font-weight: 600;
    font-size: 0.95rem;
  }
  .title-btn i {
    font-size: 1.1rem;
    color: var(--surface-fg-muted);
  }
  .add {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-md);
    color: var(--surface-fg-muted);
    transition:
      background var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }
  .add:hover {
    background: var(--surface-raised);
    color: var(--surface-fg);
    transform: rotate(90deg);
  }

  /* ── the pile ─────────────────────────────────────────────────────────── */
  .pile {
    flex: 1;
    overflow-y: auto;
    padding: 20px 18px 32px;
  }

  /* Each book is a 2-column grid: [bar/spine | drawer]. Closed, the bar fills
     the row (1fr) and the drawer is 0-width. Open, the bar shrinks to a 46px
     vertical spine and the drawer takes the rest. Animating the grid columns
     makes the bar→spine rotation and page unfurl one continuous motion. */
  .book {
    position: relative;
    isolation: isolate; /* own stacking context so the kebab can't be covered
                           by the next overlapping book's bar */
    display: grid;
    grid-template-columns: 1fr 0fr;
    align-items: stretch;
    gap: 0;
    margin-top: -3px; /* slight overlap → reads as a stacked pile */
    transition:
      grid-template-columns var(--dur-slow) var(--ease-out),
      gap var(--dur-slow) var(--ease-out),
      margin var(--dur-base) var(--ease-out);
  }
  .book:first-child {
    margin-top: 0;
  }
  .book.open {
    grid-template-columns: 46px 1fr;
    gap: 9px;
    margin: 12px 0 16px;
    z-index: 5;
  }

  /* ── the bar (closed: horizontal · open: vertical spine) ──────────────── */
  .bar {
    position: relative;
    grid-column: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 50px;
    /* reserve room on the right so the chevron/meta don't sit under the kebab */
    padding: 0 44px 0 16px;
    border-radius: 12px;
    text-align: left;
    color: var(--ink);
    overflow: hidden;
    background: linear-gradient(
      135deg,
      var(--cover) 0%,
      color-mix(in oklab, var(--cover) 86%, black) 100%
    );
    box-shadow:
      inset 4px 0 0 var(--spine),
      0 2px 5px rgba(0, 0, 0, 0.1);
    transition:
      height var(--dur-slow) var(--ease-out),
      padding var(--dur-slow) var(--ease-out),
      border-radius var(--dur-slow) var(--ease-out),
      box-shadow var(--dur-base) var(--ease-out),
      transform var(--dur-base) var(--ease-out);
  }
  .bar::before {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 3px;
    border-radius: 12px 12px 0 0;
    background: color-mix(in oklab, var(--cover) 55%, white);
    opacity: 0.45;
  }

  .bar-label {
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-size: 1.02rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: transform var(--dur-slow) var(--ease-out);
  }
  .bar-meta {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.7;
    white-space: nowrap;
  }
  .bar-chevron {
    font-size: 1.1rem;
    opacity: 0.6;
    transition: transform var(--dur-base) var(--ease-out);
  }

  .book:not(.open) .bar:hover {
    transform: translateY(-2px) translateX(2px);
    box-shadow:
      inset 4px 0 0 var(--spine),
      0 6px 14px rgba(0, 0, 0, 0.16);
  }

  /* open: bar fills its 46px column, stretches to the page height, title goes
     vertical (rotating through 45° as the column narrows) */
  .book.open .bar {
    height: auto;
    min-height: 130px;
    padding: 10px 0;
    border-radius: 12px 4px 4px 12px;
    justify-content: center;
  }
  .book.open .bar-label {
    transform: rotate(90deg);
    flex: 0 0 auto;
    max-width: 200px;
    text-align: center;
  }
  .book.open .bar-meta {
    display: none;
  }
  .book.open .bar-chevron {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.95rem;
  }

  /* ── drawer (notes) — the open notebook's page ────────────────────────── */
  .drawer {
    grid-column: 2;
    min-width: 0;
    overflow: hidden;
  }
  .drawer-inner {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background-color: var(--page);
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 33px,
      var(--page-line) 33px,
      var(--page-line) 34px
    );
    border-radius: 0 12px 12px 0;
    /* binding gutter shadow on the left + soft page lift */
    box-shadow:
      inset 7px 0 9px -7px rgba(0, 0, 0, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.08);
    opacity: 0;
    transition: opacity var(--dur-base) var(--ease-out) 70ms;
  }
  .book.open .drawer-inner {
    opacity: 1;
  }

  .note {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border-radius: var(--radius-md);
    color: var(--page-ink);
    text-align: left;
    transition: background var(--dur-fast) var(--ease-out);
    transform: translateY(-4px);
    animation: noteIn var(--dur-base) var(--ease-out) forwards;
  }
  @keyframes noteIn {
    to {
      transform: translateY(0);
    }
  }
  .note:hover {
    background: var(--page-raised);
  }
  .note.active {
    background: color-mix(in oklab, var(--spine) 18%, transparent);
    color: var(--page-ink);
    font-weight: 600;
  }
  .note i {
    font-size: 1rem;
    color: var(--page-ink-muted);
  }
  .note.active i {
    color: var(--spine);
  }
  .note-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
  }
  .date {
    font-size: 0.7rem;
    color: var(--page-ink-subtle);
    font-variant-numeric: tabular-nums;
  }
  .note.summary {
    border-left: 2px solid var(--spine);
  }
  .add-note {
    color: var(--page-ink-muted);
    border: 1.5px dashed color-mix(in oklab, var(--page-ink) 25%, transparent);
    margin-top: 2px;
  }
  .add-note:hover {
    color: var(--page-ink);
    background: var(--page-raised);
  }
  .empty-cta {
    color: var(--page-ink-muted);
  }

  /* ── empties ──────────────────────────────────────────────────────────── */
  .empty {
    margin: 12px 4px;
    color: var(--page-ink-subtle);
    font-size: 0.85rem;
  }
  .empty-cta {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 11px 14px;
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--surface-fg-muted);
    border: 1.5px dashed var(--border-strong);
    transition:
      background var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
    font-size: 0.875rem;
  }
  .empty-cta:hover {
    background: var(--surface-sunken);
    color: var(--surface-fg);
  }

  .empty-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 28px 20px;
    width: 100%;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    color: var(--surface-fg-muted);
    font-size: 0.85rem;
    transition: background var(--dur-fast);
  }
  .empty-stack:hover {
    background: var(--surface-sunken);
    color: var(--surface-fg);
  }
  .ghost-cover {
    width: 60px;
    height: 78px;
    border-radius: 8px;
    border: 1.5px dashed var(--border-strong);
    display: grid;
    place-items: center;
  }
  .ghost-cover i {
    font-size: 1.6rem;
  }
</style>
