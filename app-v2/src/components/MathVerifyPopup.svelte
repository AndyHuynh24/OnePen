<script lang="ts">
  // Math verify popup — shown above a math_result. For 3s it displays what the
  // OCR read (so you can confirm the handwriting was understood) with a countdown
  // ring, then auto-hides. Tapping the answer re-opens it. An "Edit" button opens
  // a calculator-style math input pad to correct the equation and re-solve.
  import { note } from '$stores/note.svelte';
  import { viewport } from '$stores/viewport.svelte';
  import { mathVerify } from '$stores/mathVerify.svelte';
  import { history } from '$stores/history.svelte';
  import { markDirty } from '$persistence/autosave';
  import { resolveMathLatex, decimalForm, refitMathResultWidth } from '$tools/math';
  import { prettyMath, prettyMathHtml } from '$lib/prettyMath';
  import type { Group } from '$types/group';

  const SHOW_MS = 3000;

  const group = $derived.by<Group | null>(() => {
    if (mathVerify.id === null) return null;
    const g = note.view(mathVerify.id);
    return g && g.type === 'math_result' ? g : null;
  });

  // measured popup size, so we can keep the WHOLE thing inside the viewport
  // (the edit pad is tall and would otherwise spill off the top/edges).
  let wrapEl = $state<HTMLDivElement | null>(null);
  let wrapW = $state(280);
  let wrapH = $state(120);
  $effect(() => {
    void mathVerify.editing; // re-measure when switching verify ↔ edit pad
    void mathVerify.id;
    if (!wrapEl) return;
    // measure after the DOM updates to this view
    requestAnimationFrame(() => {
      if (!wrapEl) return;
      wrapW = wrapEl.offsetWidth;
      wrapH = wrapEl.offsetHeight;
    });
  });

  // top-left placement (screen px), clamped fully into the viewport. Prefer
  // sitting just above the answer; flip below if there's no room above.
  const pos = $derived.by(() => {
    const g = group;
    if (!g) return { x: 0, y: 0 };
    void mathVerify.editing;
    void mathVerify.nonce;
    const m = 8; // viewport margin
    const sx = (g.bbox.x - viewport.offset.x) * viewport.scale;
    const sy = (g.bbox.y - viewport.offset.y) * viewport.scale;
    const sh = g.bbox.h * viewport.scale;

    // x: align to the answer's left, clamped
    const x = Math.max(m, Math.min(sx, window.innerWidth - wrapW - m));

    // y: above the answer (gap of 10), else below it, then clamp
    let y = sy - wrapH - 10;
    if (y < m) y = sy + sh + 10; // not enough room above → go below
    y = Math.max(m, Math.min(y, window.innerHeight - wrapH - m));
    return { x, y };
  });

  // countdown: 1 → 0 over SHOW_MS, restarting whenever nonce changes (re-open).
  // Pauses while editing.
  let progress = $state(1);
  let raf = 0;
  $effect(() => {
    void mathVerify.nonce; // restart on every open
    const editing = mathVerify.editing;
    const pinned = mathVerify.pinned;
    // no countdown when editing OR pinned (user-tapped — stays until tap-outside)
    if (mathVerify.id === null || editing || pinned) {
      cancelAnimationFrame(raf);
      progress = 1;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / SHOW_MS, 1);
      progress = 1 - t;
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        mathVerify.close(); // auto-hide
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  // SVG ring geometry
  const R = 9;
  const C = 2 * Math.PI * R;

  // ── math input pad (TI-calculator style: plain text, not LaTeX) ──────────────
  let draft = $state('');
  $effect(() => {
    // seed with the friendly form, e.g. "20/10 + 10" (not "\frac{20}{10}+10")
    if (mathVerify.editing && group) draft = prettyMath(group.mathLatex);
  });

  // calculator keypad — inserts plain symbols
  const KEYS = [
    ['7', '8', '9', '÷', '('],
    ['4', '5', '6', '×', ')'],
    ['1', '2', '3', '-', '^'],
    ['0', '.', '=', '+', '√'],
    ['x', 'y', 'π', '/', '∫'],
  ];

  function press(k: string) {
    draft += k;
  }
  function backspace() {
    draft = draft.slice(0, -1);
  }
  function clearAll() {
    draft = '';
  }

  /** Convert the calculator-style draft back to something the solver parses. */
  function toSolverInput(s: string): string {
    return s
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, '\\pi')
      .replace(/∫/g, '\\int')
      .replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}')
      .replace(/√\s*(\d+|[a-zA-Z])/g, '\\sqrt{$1}');
  }

  async function applyEdit() {
    const g = group;
    if (!g || !draft.trim()) return;
    await resolveMathLatex(g.id, toSolverInput(draft.trim()));
    mathVerify.open(g.id); // back to the verify view, restart timer
  }
  function cancelEdit() {
    mathVerify.close();
  }

  // ── decimal ⇄ fraction toggle (only for division/fraction answers) ───────────
  const decimal = $derived(group ? decimalForm(group.mathExact ?? group.text) : null);
  const showingDecimal = $derived(group?.mathDecimal === true);

  function toggleDecimal() {
    const g = group;
    if (!g) return;
    if (g.mathDecimal) {
      history.capture();
      g.text = g.mathExact ?? g.text ?? '';
      g.mathDecimal = false;
    } else {
      const d = decimalForm(g.mathExact ?? g.text);
      if (d == null) return;
      history.capture();
      if (g.mathExact == null) g.mathExact = g.text;
      g.text = d;
      g.mathDecimal = true;
    }
    refitMathResultWidth(g);
    note.commit();
    markDirty();
    mathVerify.pin(g.id); // keep the popup open so the user can toggle back
  }
</script>

{#if group}
  {@const g = group}
  <!-- no backdrop (would swallow the tap that opened it). A tap elsewhere on the
       canvas closes it via the pointer layer — same as the sticky-note popup. -->
  <div class="wrap" bind:this={wrapEl} style="left: {pos.x}px; top: {pos.y}px;">
    {#if mathVerify.editing}
      <!-- calculator-style input pad -->
      <div class="pad" role="dialog" aria-label="Edit equation">
        <header>
          <span><i class="bx bx-edit"></i> Fix equation</span>
          <button class="x" onclick={cancelEdit} aria-label="Cancel"><i class="bx bx-x"></i></button>
        </header>
        <input
          class="draft"
          value={draft}
          oninput={(e) => (draft = (e.target as HTMLInputElement).value)}
          placeholder="20/10 + 10"
          spellcheck="false"
        />
        <div class="keys">
          {#each KEYS as row}
            <div class="row">
              {#each row as k}
                <button class="key" onclick={() => press(k)}>{k}</button>
              {/each}
            </div>
          {/each}
          <div class="row">
            <button class="key wide" onclick={clearAll}>Clear</button>
            <button class="key" onclick={backspace} aria-label="Backspace"><i class="bx bx-arrow-back"></i></button>
            <button class="key solve" onclick={applyEdit}>Solve</button>
          </div>
        </div>
      </div>
    {:else}
      <!-- verify view: shows what the OCR read (calculator-style) -->
      <div class="verify">
        <button class="card" onclick={() => mathVerify.edit()} title="Tap to fix">
          {#if !mathVerify.pinned}
            <svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="track" cx="12" cy="12" r={R} />
              <circle
                class="fill"
                cx="12"
                cy="12"
                r={R}
                stroke-dasharray={C}
                stroke-dashoffset={C * (1 - progress)}
                transform="rotate(-90 12 12)"
              />
            </svg>
          {:else}
            <i class="bx bx-search-alt read-icon"></i>
          {/if}
          <div class="read">
            <span class="lbl">Read as</span>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <span class="eq">{@html prettyMathHtml(g.mathLatex) || '—'}</span>
          </div>
          <span class="edit-hint"><i class="bx bx-edit"></i></span>
        </button>
        {#if decimal !== null}
          <button
            class="dec"
            class:on={showingDecimal}
            onclick={toggleDecimal}
            title={showingDecimal ? 'Show the exact fraction' : 'Show as a decimal (4 dp)'}
          >
            <i class="bx {showingDecimal ? 'bx-math' : 'bx-coin'}"></i>
            {showingDecimal ? 'Show fraction' : 'Show decimal'}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap {
    position: fixed;
    z-index: 140;
    font-family: var(--font-ui);
  }
  .read-icon { font-size: 1.1rem; color: var(--surface-fg-muted); flex-shrink: 0; }
  .card {
    display: flex; align-items: center; gap: 10px;
    max-width: 300px;
    padding: 8px 12px;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    animation: pop var(--dur-fast) var(--ease-out);
  }
  @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }
  .ring { width: 22px; height: 22px; flex-shrink: 0; }
  .ring .track { fill: none; stroke: var(--surface-raised); stroke-width: 3; }
  .ring .fill { fill: none; stroke: var(--accent); stroke-width: 3; stroke-linecap: round; }
  .read { display: flex; flex-direction: column; min-width: 0; text-align: left; }
  .read .lbl { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--surface-fg-muted); }
  .read .eq {
    font-family: 'Mali', var(--font-ui); font-size: 0.92rem; color: var(--surface-fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .read .eq :global(sup) { font-size: 0.7em; vertical-align: super; line-height: 0; }
  .edit-hint { color: var(--surface-fg-muted); font-size: 1rem; flex-shrink: 0; }
  .card:hover .edit-hint { color: var(--accent); }

  .verify { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
  .dec {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 6px 10px; border-radius: var(--radius-md);
    background: var(--surface-raised); color: var(--surface-fg-muted);
    font-size: 0.78rem; font-family: var(--font-ui);
    border: 1px solid var(--border);
  }
  .dec:hover { background: var(--surface-bg); color: var(--surface-fg); }
  .dec.on { color: var(--accent); border-color: color-mix(in oklab, var(--accent) 50%, transparent); }
  .dec i { font-size: 0.95rem; }

  .pad {
    width: 260px;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 10px;
    animation: pop var(--dur-fast) var(--ease-out);
  }
  .pad header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px; font-size: 0.78rem; font-weight: 600; color: var(--surface-fg-muted);
  }
  .pad header span { display: flex; align-items: center; gap: 6px; }
  .x { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .x:hover { background: var(--surface-raised); color: var(--surface-fg); }
  .draft {
    width: 100%; margin-bottom: 8px; padding: 8px 10px;
    border: 1px solid var(--border); border-radius: var(--radius-md);
    background: var(--surface-bg); color: var(--surface-fg);
    font-family: 'Mali', var(--font-ui); font-size: 0.95rem;
  }
  .draft:focus { outline: none; border-color: var(--accent); }
  .keys { display: flex; flex-direction: column; gap: 5px; }
  .keys .row { display: flex; gap: 5px; }
  .key {
    flex: 1; height: 36px;
    display: grid; place-items: center;
    border-radius: var(--radius-sm);
    background: var(--surface-raised); color: var(--surface-fg);
    font-size: 0.9rem; font-family: 'Mali', var(--font-ui);
  }
  .key:hover { background: var(--surface-bg); }
  .key.wide { flex: 2; }
  .key.solve { flex: 2; background: var(--accent); color: var(--accent-fg); font-weight: 600; }
  .key.solve:hover { background: color-mix(in oklab, var(--accent) 92%, white); }
</style>
