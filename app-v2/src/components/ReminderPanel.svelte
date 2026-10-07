<script lang="ts">
  // Reminder bell + all-notebooks panel. The bell (top-right) shows the count;
  // the panel lists every reminder across notebooks, soonest first. Tapping one
  // opens its note and centers the viewport on the tagged strokes.
  import { ui } from '$stores/ui.svelte';
  import { note } from '$stores/note.svelte';
  import { toast } from '$stores/toast.svelte';
  import { scanAllReminders, deleteReminder, type ReminderEntry } from '$lib/reminders';
  import { openNoteAndCenter } from '$lib/navigate';
  import { getEngine } from '$canvas/engineRef';

  // Big, full-width preview of the tagged strokes — this IS the message. The
  // strokes are vector-redrawn (not a stretched bitmap), so they stay crisp like
  // the main canvas. The backing store is sized to the canvas's TRUE measured
  // pixel box × devicePixelRatio, re-measured via ResizeObserver, so there's
  // never a stretch between the bitmap and its CSS display box.
  const THUMB_H = 130;

  function thumb(node: HTMLCanvasElement, entry: ReminderEntry) {
    let current = entry;

    function render() {
      const e = current;
      const rect = node.getBoundingClientRect();
      const cssW = Math.round(rect.width);
      const cssH = Math.round(rect.height) || THUMB_H;
      if (cssW <= 0) return; // not laid out yet — the observer will call again
      const dpr = window.devicePixelRatio || 1;
      // only resize the backing store when it actually changes (resizing clears it)
      if (node.width !== cssW * dpr || node.height !== cssH * dpr) {
        node.width = Math.round(cssW * dpr);
        node.height = Math.round(cssH * dpr);
      }
      const ctx = node.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const b = e.bbox;
      if (!b || b.w <= 0 || b.h <= 0) return;
      const pad = 14;
      // uniform scale preserves aspect ratio (no stretching); cap the zoom so a
      // tiny scribble doesn't blow up to fuzzy giant strokes
      const scale = Math.min((cssW - pad * 2) / b.w, (cssH - pad * 2) / b.h, 3);
      const ox = (cssW - b.w * scale) / 2;
      const oy = (cssH - b.h * scale) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      ctx.translate(-b.x, -b.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of e.strokes) {
        if (s.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        // quadratic-midpoint smoothing — same curve style as the main canvas
        for (let i = 1; i < s.points.length - 1; i++) {
          const c = s.points[i];
          const n = s.points[i + 1];
          ctx.quadraticCurveTo(c.x, c.y, (c.x + n.x) / 2, (c.y + n.y) / 2);
        }
        const last = s.points[s.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.strokeStyle = s.color;
        // CONSTANT on-screen thickness regardless of group size. After ctx.scale(),
        // a lineWidth L renders as L×scale CSS px, so /scale cancels the fit-scale →
        // every reminder shows its true set stroke width (size), like the canvas.
        ctx.lineWidth = (s.size || 2) / scale;
        ctx.stroke();
      }
      ctx.restore();
    }

    const ro = new ResizeObserver(() => render());
    ro.observe(node);
    render();

    return {
      update(next: ReminderEntry) {
        current = next;
        render();
      },
      destroy() {
        ro.disconnect();
      },
    };
  }

  let entries = $state<ReminderEntry[]>([]);
  let loading = $state(false);

  async function refresh() {
    loading = true;
    try {
      entries = await scanAllReminders();
    } finally {
      loading = false;
    }
  }

  const count = $derived(entries.length);
  const overdueCount = $derived(entries.filter((e) => e.overdue).length);

  // refresh on mount, whenever the panel opens, and when the open note changes
  $effect(() => {
    void ui.reminderPanelOpen;
    void note.path;
    refresh();
  });

  function fmt(date: string): string {
    if (!date) return 'No date';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'No date';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function relative(date: string): string {
    if (!date) return '';
    const ms = new Date(date).getTime() - Date.now();
    const day = 86_400_000;
    const abs = Math.abs(ms);
    if (abs < 3_600_000) {
      const m = Math.round(abs / 60_000);
      return ms < 0 ? `${m}m ago` : `in ${m}m`;
    }
    if (abs < day) {
      const h = Math.round(abs / 3_600_000);
      return ms < 0 ? `${h}h ago` : `in ${h}h`;
    }
    const d = Math.round(abs / day);
    return ms < 0 ? `${d}d ago` : `in ${d}d`;
  }

  async function go(e: ReminderEntry) {
    ui.toggleReminderPanel(false);
    const ok = await openNoteAndCenter(e.notePath, e.bbox);
    if (!ok) {
      toast.show('Could not open note', 'bx-error');
      void refresh();
    }
  }

  async function remove(e: ReminderEntry, ev: MouseEvent) {
    ev.stopPropagation(); // don't trigger the row's navigate
    // optimistic: drop it from the list immediately, then clear the tags
    entries = entries.filter(
      (x) => !(x.notePath === e.notePath && x.reminderGroupId === e.reminderGroupId),
    );
    await deleteReminder(e.notePath, e.reminderGroupId);
    getEngine()?.invalidateDraw(); // refresh the canvas bell badge if it's the open note
    toast.show('Reminder removed', 'bx-check');
  }
</script>

<button
  class="bell"
  class:has={count > 0}
  class:overdue={overdueCount > 0}
  onclick={() => ui.toggleReminderPanel()}
  aria-label="Reminders"
  title="Reminders"
>
  <i class="bx bx-bell"></i>
  {#if count > 0}<span class="badge">{count}</span>{/if}
</button>

{#if ui.reminderPanelOpen}
  <div class="backdrop" onclick={() => ui.toggleReminderPanel(false)} role="presentation"></div>
  <aside class="panel" aria-label="All reminders">
    <header>
      <span><i class="bx bx-bell"></i> Reminders</span>
      <button class="x" onclick={() => ui.toggleReminderPanel(false)} aria-label="Close">
        <i class="bx bx-x"></i>
      </button>
    </header>

    {#if loading}
      <p class="empty">Loading…</p>
    {:else if entries.length === 0}
      <p class="empty">No reminders yet. Use the bell tool in the radial toolbox to add one.</p>
    {:else}
      <ul>
        {#each entries as e (e.notePath + e.reminderGroupId)}
          <li>
            <button class="row" onclick={() => go(e)}>
              <canvas class="thumb" use:thumb={e}></canvas>
              <span class="meta">
                <span class="body">
                  <span class="when" class:overdue={e.overdue}>{fmt(e.date)}</span>
                  <span class="where">{e.noteName} · {e.folder}</span>
                </span>
                <span class="rel" class:overdue={e.overdue}>{relative(e.date)}</span>
                <span
                  class="del"
                  role="button"
                  tabindex="0"
                  aria-label="Delete reminder"
                  title="Delete reminder"
                  onclick={(ev) => remove(e, ev)}
                  onkeydown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && remove(e, ev as unknown as MouseEvent)}
                >
                  <i class="bx bx-trash"></i>
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  /* sits in the top-right cluster with the gear (64) + avatar (16) buttons */
  .bell {
    position: fixed;
    top: 16px;
    right: 112px;
    z-index: 60;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-md);
    color: var(--surface-fg);
    font-size: 1.2rem;
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast);
  }
  .bell:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .bell.has { color: var(--accent); }
  .bell.overdue { color: #e5484d; }
  .badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-fg);
    font-family: var(--font-ui);
    font-size: 0.66rem;
    font-weight: 700;
  }
  .bell.overdue .badge { background: #e5484d; }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 119;
    background: var(--scrim);
    animation: fade var(--dur-fast) var(--ease-out);
  }
  @keyframes fade { from { opacity: 0; } }
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, 90vw);
    z-index: 120;
    /* same frosted-glass treatment as the notebook shelf, for consistency */
    background: color-mix(in oklab, var(--surface-panel) 96%, transparent);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    font-family: var(--font-ui);
    animation: slideIn var(--dur-base) var(--ease-out);
  }
  @keyframes slideIn { from { transform: translateX(100%); } }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px; border-bottom: 1px solid var(--divider);
    font-size: 1rem; font-weight: 600; color: var(--surface-fg);
  }
  header span { display: flex; align-items: center; gap: 8px; }
  header i { color: var(--surface-fg); }
  .x { width: 30px; height: 30px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .x:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .empty { padding: 24px 18px; color: var(--surface-fg-muted); font-size: 0.88rem; line-height: 1.5; }
  ul { list-style: none; margin: 0; padding: 10px; overflow-y: auto; }
  li { margin-bottom: 10px; }
  .row {
    width: 100%;
    display: flex; flex-direction: column; gap: 0;
    border-radius: var(--radius-md);
    text-align: left;
    overflow: hidden;
    background: var(--surface-bg);
    border: 1px solid var(--divider);
  }
  .row:hover { border-color: var(--accent); }
  /* the stroke preview IS the message — big + full width */
  .thumb {
    width: 100%; height: 130px; display: block;
    background: var(--surface-raised);
    border-bottom: 1px solid var(--divider);
  }
  .meta { display: flex; align-items: center; gap: 12px; padding: 9px 12px; }
  .body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .when { font-size: 0.9rem; font-weight: 600; color: var(--surface-fg); }
  .when.overdue { color: #e5484d; }
  .where { font-size: 0.78rem; color: var(--surface-fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rel { font-size: 0.78rem; color: var(--surface-fg-muted); flex-shrink: 0; font-weight: 500; }
  .rel.overdue { color: #e5484d; font-weight: 600; }
  .del {
    flex-shrink: 0;
    width: 30px; height: 30px;
    display: grid; place-items: center;
    border-radius: var(--radius-sm);
    color: var(--surface-fg-muted);
    cursor: pointer;
  }
  .del:hover { background: color-mix(in oklab, var(--danger) 14%, transparent); color: var(--danger); }
</style>
