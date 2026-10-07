<script lang="ts">
  // Flashcard review — a flip-card deck built from the current notebook's tapes.
  // Front = question (the un-taped strokes of the enclosed group); flip to reveal
  // the answer (the taped strokes) in place. Prev/next, progress, go-to-source.
  import { ui } from '$stores/ui.svelte';
  import { note } from '$stores/note.svelte';
  import { toast } from '$stores/toast.svelte';
  import { folderOf } from '$persistence/notes';
  import { scanFolderForFlashcards, type Flashcard, type CardStroke } from '$lib/flashcards';
  import { openNoteAndCenter } from '$lib/navigate';

  let cards = $state<Flashcard[]>([]);
  let index = $state(0);
  let flipped = $state(false);
  let loading = $state(false);

  const current = $derived(cards[index] ?? null);

  function folder(): string | null {
    if (note.path) return folderOf(note.path);
    return ui.selectedFolder;
  }

  async function load() {
    const f = folder();
    if (!f) {
      cards = [];
      return;
    }
    loading = true;
    try {
      cards = await scanFolderForFlashcards(f);
      index = 0;
      flipped = false;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (ui.flashcardOpen) load();
  });

  function close() {
    ui.toggleFlashcard(false);
  }
  function next() {
    if (index < cards.length - 1) {
      index++;
      flipped = false;
    }
  }
  function prev() {
    if (index > 0) {
      index--;
      flipped = false;
    }
  }
  function flip() {
    flipped = !flipped;
  }

  async function goToSource() {
    const c = current;
    if (!c) return;
    ui.toggleFlashcard(false);
    const ok = await openNoteAndCenter(c.notePath, c.bbox);
    if (!ok) toast.show('Could not open note', 'bx-error');
  }

  // keyboard: ←/→ navigate, space/enter flip, Esc close
  function onKey(e: KeyboardEvent) {
    if (!ui.flashcardOpen) return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flip();
    } else if (e.key === 'Escape') close();
  }

  // crisp vector render of a set of card strokes within `bbox`, scaled to fit.
  function face(node: HTMLCanvasElement, data: { strokes: CardStroke[]; bbox: Flashcard['bbox'] }) {
    let current = data;
    function render() {
      const { strokes, bbox } = current;
      const rect = node.getBoundingClientRect();
      const cssW = Math.round(rect.width);
      const cssH = Math.round(rect.height);
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      if (node.width !== cssW * dpr || node.height !== cssH * dpr) {
        node.width = Math.round(cssW * dpr);
        node.height = Math.round(cssH * dpr);
      }
      const ctx = node.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (!bbox || bbox.w <= 0 || bbox.h <= 0) return;
      const pad = 26;
      const scale = Math.min((cssW - pad * 2) / bbox.w, (cssH - pad * 2) / bbox.h, 3);
      const ox = (cssW - bbox.w * scale) / 2;
      const oy = (cssH - bbox.h * scale) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      ctx.translate(-bbox.x, -bbox.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of strokes) {
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
        // CONSTANT on-screen thickness regardless of card size. After ctx.scale(),
        // a lineWidth L renders as L×scale CSS px, so /scale cancels the fit-scale →
        // every card shows its true set stroke width (size), like the canvas.
        ctx.lineWidth = (s.size || 2) / scale;
        ctx.stroke();
      }
      ctx.restore();
    }
    const ro = new ResizeObserver(() => render());
    ro.observe(node);
    render();
    return {
      update(next: typeof data) {
        current = next;
        render();
      },
      destroy() {
        ro.disconnect();
      },
    };
  }
</script>

<svelte:window onkeydown={onKey} />

{#if ui.flashcardOpen}
  <div class="backdrop" onclick={close} role="presentation"></div>
  <div class="modal" role="dialog" aria-label="Flashcard review">
    <header>
      <h2><i class="bx bx-card"></i> Flashcards</h2>
      <button class="x" onclick={close} aria-label="Close"><i class="bx bx-x"></i></button>
    </header>

    {#if loading}
      <div class="state">Scanning notebook…</div>
    {:else if cards.length === 0}
      <div class="state">
        <i class="bx bx-card"></i>
        <p>No flashcards yet.</p>
        <span>Box (or curly/bracket) a group of strokes, then tape part of it — the taped part becomes the answer.</span>
      </div>
    {:else if current}
      <div class="progress">
        <span>{index + 1} / {cards.length}</span>
        <div class="bar"><div class="fill" style="width: {((index + 1) / cards.length) * 100}%"></div></div>
      </div>

      <button class="card" class:flipped onclick={flip} aria-label="Flip card">
        <div class="card-inner">
          <div class="face front">
            <span class="face-tag">Question</span>
            <canvas use:face={{ strokes: current.question, bbox: current.bbox }}></canvas>
            <span class="hint">Tap to reveal answer</span>
          </div>
          <div class="face back">
            <span class="face-tag answer">Answer</span>
            <canvas use:face={{ strokes: [...current.question, ...current.answer], bbox: current.bbox }}></canvas>
            <span class="src">{current.noteName}</span>
          </div>
        </div>
      </button>

      <div class="controls">
        <button class="nav" onclick={prev} disabled={index === 0} aria-label="Previous"><i class="bx bx-chevron-left"></i></button>
        <button class="source" onclick={goToSource}><i class="bx bx-link-external"></i> Go to note</button>
        <button class="nav" onclick={next} disabled={index === cards.length - 1} aria-label="Next"><i class="bx bx-chevron-right"></i></button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 190;
    background: var(--scrim-strong);
    backdrop-filter: blur(2px);
    animation: fade var(--dur-fast) var(--ease-out);
  }
  @keyframes fade { from { opacity: 0; } }
  .modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 191;
    width: min(560px, 94vw);
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 18px;
    font-family: var(--font-ui);
    animation: pop var(--dur-base) var(--ease-out);
  }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -47%) scale(0.97); } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.1rem; font-weight: 600; color: var(--surface-fg); }
  h2 i { color: var(--surface-fg); }
  .x { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .x:hover { background: var(--surface-raised); color: var(--surface-fg); }

  .state {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 50px 24px; text-align: center; color: var(--surface-fg-muted);
  }
  .state i { font-size: 2.6rem; color: var(--surface-fg-subtle); }
  .state p { margin: 0; font-size: 1rem; font-weight: 600; color: var(--surface-fg); }
  .state span { font-size: 0.84rem; line-height: 1.5; max-width: 360px; }

  .progress { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .progress span { font-size: 0.8rem; color: var(--surface-fg-muted); font-variant-numeric: tabular-nums; }
  .bar { flex: 1; height: 5px; border-radius: 3px; background: var(--surface-raised); overflow: hidden; }
  .fill { height: 100%; background: var(--accent); transition: width var(--dur-base) var(--ease-out); }

  .card {
    width: 100%; height: 340px;
    perspective: 1400px;
    background: none; border: none; padding: 0; cursor: pointer;
  }
  .card-inner {
    position: relative; width: 100%; height: 100%;
    transition: transform 480ms cubic-bezier(0.4, 0.2, 0.2, 1);
    transform-style: preserve-3d;
  }
  .card.flipped .card-inner { transform: rotateY(180deg); }
  .face {
    position: absolute; inset: 0;
    backface-visibility: hidden;
    display: flex; flex-direction: column;
    background: var(--surface-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }
  .face.back { transform: rotateY(180deg); }
  .face canvas { flex: 1; width: 100%; min-height: 0; display: block; }
  .face-tag {
    position: absolute; top: 12px; left: 12px;
    font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--surface-fg-muted);
    background: var(--surface-raised); padding: 3px 8px; border-radius: var(--radius-pill);
  }
  .face-tag.answer { color: var(--accent); background: var(--accent-soft); }
  .hint, .src {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    font-size: 0.76rem; color: var(--surface-fg-subtle); white-space: nowrap;
  }
  .src { color: var(--surface-fg-muted); }

  .controls { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
  .nav {
    width: 46px; height: 44px; display: grid; place-items: center;
    border-radius: var(--radius-md); border: 1px solid var(--border);
    color: var(--surface-fg); font-size: 1.3rem;
  }
  .nav:hover:not(:disabled) { background: var(--surface-raised); }
  .nav:disabled { opacity: 0.35; }
  .source {
    flex: 1; height: 44px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    border-radius: var(--radius-md);
    background: var(--surface-raised); color: var(--surface-fg);
    font-size: 0.85rem; font-weight: 500;
  }
  .source:hover { background: var(--surface-panel); border: 1px solid var(--border); }
</style>
