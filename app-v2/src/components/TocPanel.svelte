<script lang="ts">
  // Table of contents — a left-side panel listing the note's headings (title
  // strokes) as crisp thumbnails, indented by level. Tap one to smooth-scroll
  // the canvas to that heading. Current-note only.
  import { ui } from '$stores/ui.svelte';
  import { note } from '$stores/note.svelte';
  import { buildToc, tocCount, type TocAnchor } from '$lib/toc';
  import { scrollToBBox } from '$lib/navigate';

  const count = $derived(tocCount(note.groups));
  let anchors = $state<TocAnchor[]>([]);

  // rebuild when the panel opens or the note content changes
  $effect(() => {
    void ui.tocOpen;
    void note.groups;
    if (ui.tocOpen) anchors = buildToc();
  });

  const PREVIEW_H = 56; // canvas display height (px)
  const SCALE_CAP = 2.6;

  // Crisp vector render. Scales by HEIGHT only, so a long title keeps its natural
  // width (the canvas grows wider than the row) and the wrapper scrolls it
  // horizontally. The backing store is sized to true pixels × DPR.
  function preview(node: HTMLCanvasElement, anchor: TocAnchor) {
    let current = anchor;
    function render() {
      const a = current;
      const b = a.bbox;
      const dpr = window.devicePixelRatio || 1;
      const cssH = PREVIEW_H;
      const padX = 10;
      const padY = 8;
      if (!b || b.w <= 0 || b.h <= 0) {
        node.style.width = '0px';
        return;
      }
      // height-fit scale (constant for every heading), then derive the width
      const scale = Math.min((cssH - padY * 2) / b.h, SCALE_CAP);
      const cssW = Math.ceil(b.w * scale + padX * 2);
      node.style.width = cssW + 'px';
      node.style.height = cssH + 'px';
      if (node.width !== cssW * dpr || node.height !== cssH * dpr) {
        node.width = Math.round(cssW * dpr);
        node.height = Math.round(cssH * dpr);
      }
      const ctx = node.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const ox = padX;
      const oy = (cssH - b.h * scale) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      ctx.translate(-b.x, -b.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of a.strokes) {
        if (s.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length - 1; i++) {
          const c = s.points[i];
          const n = s.points[i + 1];
          ctx.quadraticCurveTo(c.x, c.y, (c.x + n.x) / 2, (c.y + n.y) / 2);
        }
        const last = s.points[s.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.strokeStyle = s.color;
        // constant on-screen thickness (L×scale = screen px → /scale cancels the
        // fit-scale). Capped so headings read clearly but not heavy in the preview.
        const screenW = Math.min(s.size || 2, 3);
        ctx.lineWidth = screenW / scale;
        ctx.stroke();
      }
      ctx.restore();
    }
    render();
    return {
      update(next: TocAnchor) {
        current = next;
        render();
      },
    };
  }

  function go(a: TocAnchor) {
    ui.toggleToc(false);
    scrollToBBox(a.bbox);
  }
</script>

<button
  class="toc-tab"
  class:has={count > 0}
  onclick={() => ui.toggleToc()}
  aria-label="Table of contents"
  title="Table of contents"
>
  <i class="bx bx-list-ul"></i>
</button>

{#if ui.tocOpen}
  <div class="backdrop" onclick={() => ui.toggleToc(false)} role="presentation"></div>
  <aside class="panel" aria-label="Table of contents">
    <header>
      <span><i class="bx bx-list-ul"></i> Contents</span>
      <button class="x" onclick={() => ui.toggleToc(false)} aria-label="Close"><i class="bx bx-x"></i></button>
    </header>

    {#if anchors.length === 0}
      <p class="empty">No headings yet. Use a Title tool (H1–H3) in the radial toolbox to mark headings.</p>
    {:else}
      <ul>
        {#each anchors as a (a.id)}
          <li class="lvl-{a.level}">
            <button class="item" onclick={() => go(a)}>
              <span class="tag">H{a.level}</span>
              <div class="scroll">
                <canvas class="preview" use:preview={a}></canvas>
              </div>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .toc-tab {
    position: fixed;
    /* sits at the top-left, just below the floating "Notes" button */
    top: 60px;
    left: 0;
    z-index: 60;
    width: 30px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-left: none;
    box-shadow: var(--shadow-md);
    color: var(--surface-fg-muted);
    font-size: 1.15rem;
  }
  .toc-tab:hover { color: var(--surface-fg); background: var(--surface-raised); }
  /* keep the icon the normal foreground color even when headings exist (no accent tint) */
  .toc-tab.has { color: var(--surface-fg); }

  .backdrop {
    position: fixed; inset: 0; z-index: 119;
    background: var(--scrim);
    animation: fade var(--dur-fast) var(--ease-out);
  }
  @keyframes fade { from { opacity: 0; } }
  .panel {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: min(360px, 90vw);
    z-index: 120;
    /* same frosted-glass treatment as the notebook shelf, for consistency */
    background: color-mix(in oklab, var(--surface-panel) 96%, transparent);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    border-right: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column;
    font-family: var(--font-ui);
    animation: slideIn var(--dur-base) var(--ease-out);
  }
  @keyframes slideIn { from { transform: translateX(-100%); } }
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
  ul { list-style: none; margin: 0; padding: 8px; overflow-y: auto; }
  li { margin-bottom: 4px; }
  .lvl-2 { padding-left: 16px; }
  .lvl-3 { padding-left: 32px; }
  .item {
    width: 100%;
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: var(--radius-md);
    text-align: left;
  }
  .item:hover { background: var(--surface-raised); }
  .tag {
    flex-shrink: 0;
    align-self: flex-start; margin-top: 4px;
    font-size: 0.66rem; font-weight: 700; color: var(--surface-fg-muted);
    background: var(--accent-soft); padding: 2px 6px; border-radius: var(--radius-sm);
  }
  /* the preview canvas keeps the title's natural width; long titles scroll here */
  .scroll {
    flex: 1; min-width: 0; height: 56px;
    overflow-x: auto; overflow-y: hidden;
    background: var(--surface-bg);
    border: 1px solid var(--divider);
    border-radius: var(--radius-sm);
    -webkit-overflow-scrolling: touch;
  }
  .scroll::-webkit-scrollbar { height: 5px; }
  .scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
  .preview { height: 56px; display: block; }
</style>
