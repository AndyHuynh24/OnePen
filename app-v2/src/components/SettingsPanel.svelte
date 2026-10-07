<script lang="ts">
  // Settings panel — three tabs:
  //   Modifiers — per-modifier color / size (slider+input+thickness preview) / visibility
  //   Toolboxes — a LIVE radial preview (matches the real radial menu); tap a slot
  //               to edit its tool + adapted options; the radial updates as you edit
  //   Canvas    — eraser size, theme toggle
  import { ui } from '$stores/ui.svelte';
  import { tools } from '$stores/tools.svelte';
  import { theme } from '$stores/theme.svelte';
  import { grid } from '$stores/grid.svelte';
  import { CONFIG } from '$config/constants';
  import {
    TOOL_REGISTRY,
    TOOL_LABELS,
    type ToolId,
    type ToolboxKind,
    type ToolboxToolConfig,
  } from '$config/tools';
  import type { ModifierKey, ModifierConfig } from '$types/group';
  import StrokeSize from './StrokeSize.svelte';
  import { gestureFeedback } from '$ml/feedback';
  import { eventStore, exportJsonl } from '$ml/eventStore';
  import { toast } from '$stores/toast.svelte';
  import ColorField from './ColorField.svelte';

  type Tab = 'modifiers' | 'toolbox' | 'canvas' | 'data';
  let tab = $state<Tab>('modifiers');

  // ── Data tab: local gesture-feedback log ──
  let logOn = $state(gestureFeedback.enabled);
  let logStats = $state<Awaited<ReturnType<typeof eventStore.stats>> | null>(null);
  async function refreshLogStats() {
    try {
      logStats = await eventStore.stats();
    } catch {
      logStats = null;
    }
  }
  $effect(() => {
    if (tab === 'data') void refreshLogStats();
  });
  function toggleLog(on: boolean) {
    logOn = on;
    gestureFeedback.setEnabled(on);
  }
  async function exportLog() {
    gestureFeedback.flushAll();
    const n = await exportJsonl();
    toast.show(n ? `Exported ${n} gesture events` : 'Nothing logged yet', 'bx-download');
    void refreshLogStats();
  }
  async function clearLog() {
    if (!confirm('Delete all logged gesture events on this device?')) return;
    await eventStore.clear();
    void refreshLogStats();
  }

  // the gesture modifiers (box/curly/brackets). The default pen is edited in its
  // own dedicated section, not here — it's a separate setting, not a gesture.
  const MODIFIER_KEYS: { key: ModifierKey; label: string }[] = [
    { key: 'box', label: 'Box' },
    { key: 'curly', label: 'Curly' },
    { key: 'squarebracket', label: 'Square Bracket' },
    { key: 'wavybracket', label: 'Wavy Bracket' },
    { key: 'circlebracket', label: 'Circle Bracket' },
  ];

  // each toolbox is triggered by a gesture; show its modifier shape PNG
  // (from /public/assets) + a text label. 'press' (the dot/hold gesture) has
  // no modifier shape, so it falls back to an icon.
  const TOOLBOXES: { kind: ToolboxKind; label: string; asset: string | null }[] = [
    { kind: 'press', label: 'Press', asset: null },
    { kind: 'underline', label: 'Underline', asset: '/assets/underline.png' },
    { kind: 'box', label: 'Box', asset: '/assets/box.png' },
    { kind: 'curly', label: 'Curly', asset: '/assets/curly.png' },
    { kind: 'squareBracket', label: 'Square', asset: '/assets/squareBracket.png' },
    { kind: 'wavyBracket', label: 'Wavy', asset: '/assets/wavyBracket.png' },
    { kind: 'circleBracket', label: 'Circle', asset: '/assets/circleBracket.png' },
  ];
  let openBox = $state<ToolboxKind>('press');
  let selSlot = $state(0);

  const ALL_TOOLS = Object.keys(TOOL_REGISTRY) as ToolId[];
  const RADIUS = 86;

  const slots = $derived(tools.toolboxLayout[openBox] ?? []);
  const current = $derived<ToolboxToolConfig | null>(slots[selSlot] ?? null);
  const currentReg = $derived(current ? TOOL_REGISTRY[current.id] : null);

  function slotPos(i: number, n: number) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * RADIUS, y: Math.sin(angle) * RADIUS };
  }

  function setMod(key: ModifierKey, patch: Partial<ModifierConfig>) {
    tools.setModifier(key, patch);
  }
  function setSlot(patch: Partial<ToolboxToolConfig>) {
    tools.setToolboxSlot(openBox, selSlot, patch);
  }
  function pickBox(kind: ToolboxKind) {
    openBox = kind;
    selSlot = 0;
  }
</script>

<button class="gear" onclick={() => ui.toggleSettings()} aria-label="Settings" title="Settings">
  <i class="bx bx-cog"></i>
</button>

{#if ui.settingsOpen}
  <div class="backdrop" onclick={() => ui.toggleSettings(false)} role="presentation"></div>
  <aside class="panel" aria-label="Settings">
    <header>
      <span><i class="bx bx-cog"></i> Settings</span>
      <button class="x" onclick={() => ui.toggleSettings(false)} aria-label="Close"><i class="bx bx-x"></i></button>
    </header>

    <nav class="tabs">
      <button class:active={tab === 'modifiers'} onclick={() => (tab = 'modifiers')}>Modifiers</button>
      <button class:active={tab === 'toolbox'} onclick={() => (tab = 'toolbox')}>Toolboxes</button>
      <button class:active={tab === 'canvas'} onclick={() => (tab = 'canvas')}>Canvas</button>
      <button class:active={tab === 'data'} onclick={() => (tab = 'data')}>Data</button>
    </nav>

    <div class="body">
      {#if tab === 'modifiers'}
        <!-- Default pen: a standalone setting (color + thickness). It's what the
             app opens with and what the Default-pen tool restores. Changing your
             live pen never alters it. -->
        <div class="default-pen">
          <div class="dp-head">
            <span class="dp-title"><i class="bx bx-pen"></i> Default pen</span>
            <ColorField
              value={tools.modifiers.defaultPen.color}
              label="Default pen color"
              onchange={(c) => setMod('defaultPen', { color: c })}
            />
          </div>
          <StrokeSize
            value={tools.modifiers.defaultPen.size}
            color={tools.modifiers.defaultPen.color}
            onchange={(v) => setMod('defaultPen', { size: v })}
          />
          <p class="hint">
            <i class="bx bx-info-circle"></i>
            Used on startup and by the Default-pen tool. Independent of your current pen.
          </p>
        </div>

        <label class="sync">
          <input
            type="checkbox"
            checked={tools.syncStrokeSize}
            onchange={(e) => tools.setSyncStrokeSize((e.target as HTMLInputElement).checked)}
          />
          Sync all modifier sizes to the pen size
        </label>

        {#each MODIFIER_KEYS as { key, label }}
          {@const m = tools.modifiers[key]}
          <div class="mod">
            <div class="mod-head">
              <span class="mod-name">{label}</span>
              <ColorField value={m.color} label="{label} color" onchange={(c) => setMod(key, { color: c })} />
              <label class="vis" title="Show the modifier stroke">
                <input
                  type="checkbox"
                  checked={m.visibility}
                  onchange={(e) => setMod(key, { visibility: (e.target as HTMLInputElement).checked })}
                />
                <i class="bx {m.visibility ? 'bx-show' : 'bx-hide'}"></i>
              </label>
            </div>
            <StrokeSize
              value={m.size}
              color={m.color}
              onchange={(v) => setMod(key, { size: v })}
            />
          </div>
        {/each}

        <button class="reset" onclick={() => tools.resetModifiers()}>
          <i class="bx bx-reset"></i> Reset modifiers
        </button>

      {:else if tab === 'toolbox'}
        <p class="hint">
          <i class="bx bx-info-circle"></i>
          Pick a modifier below, then tap a tool in the ring to edit that slot.
        </p>
        <div class="box-picker">
          {#each TOOLBOXES as { kind, label, asset }}
            <button class="bp" class:active={openBox === kind} onclick={() => pickBox(kind)}>
              {#if asset}
                <img src={asset} alt="" />
              {:else}
                <i class="bx bx-pointer"></i>
              {/if}
              <span>{label}</span>
            </button>
          {/each}
        </div>

        <label class="sync">
          <input
            type="checkbox"
            checked={tools.syncBracketToolboxes}
            onchange={(e) => tools.setSyncBracketToolboxes((e.target as HTMLInputElement).checked)}
          />
          Sync all bracket toolboxes
        </label>

        <!-- LIVE radial preview — same look as the real radial menu -->
        <div class="radial">
          <div class="r-center"></div>
          {#each slots as cfg, i (i)}
            {@const reg = TOOL_REGISTRY[cfg.id]}
            {@const p = slotPos(i, slots.length)}
            <button
              class="r-tool"
              class:sel={selSlot === i}
              class:tape={cfg.id === 'tape'}
              style="--x: {p.x}px; --y: {p.y}px; --c: {cfg.color ?? 'var(--surface-fg)'}"
              onclick={() => (selSlot = i)}
              aria-label="Slot {i + 1}: {TOOL_LABELS[cfg.id]}"
            >
              <i class="bx {reg?.icon ?? 'bx-circle'}"></i>
            </button>
          {/each}
        </div>

        <!-- editor for the selected slot — options adapt to the chosen tool -->
        {#if current}
          {@const reg = currentReg}
          <div class="slot-editor">
            <div class="se-row">
              <span class="se-lbl">Tool</span>
              <select
                value={current.id}
                onchange={(e) => setSlot({ id: (e.target as HTMLSelectElement).value as ToolId })}
              >
                {#each ALL_TOOLS as t}
                  <option value={t}>{TOOL_LABELS[t]}</option>
                {/each}
              </select>
            </div>

            {#if reg?.colorCustomizable !== false}
              <div class="se-row">
                <span class="se-lbl">Color</span>
                <ColorField value={current.color ?? '#ffffff'} label="Tool color" onchange={(c) => setSlot({ color: c })} />
              </div>
            {/if}

            {#if reg?.sizeCustomizable}
              <div class="se-col">
                <span class="se-lbl">Size</span>
                <StrokeSize
                  value={current.size ?? 2}
                  color={current.color ?? '#888'}
                  onchange={(v) => setSlot({ size: v })}
                />
              </div>
            {/if}

            {#if reg?.tapePresetCustomizable}
              <div class="se-row">
                <span class="se-lbl">Pattern</span>
                <select
                  value={current.tapePreset ?? 'polkadot'}
                  onchange={(e) => setSlot({ tapePreset: (e.target as HTMLSelectElement).value })}
                >
                  {#each CONFIG.TAPE.PRESETS as p}
                    <option value={p.id}>{p.name}</option>
                  {/each}
                </select>
              </div>
            {/if}

            {#if reg?.visibilityCustomizable}
              <label class="se-row vis-row">
                <span class="se-lbl">Keep stroke visible</span>
                <input
                  type="checkbox"
                  checked={current.visibility ?? true}
                  onchange={(e) => setSlot({ visibility: (e.target as HTMLInputElement).checked })}
                />
              </label>
            {/if}
          </div>
        {/if}

        <button class="reset" onclick={() => tools.resetToolboxLayout()}>
          <i class="bx bx-reset"></i> Reset toolboxes
        </button>

      {:else if tab === 'data'}
        <label class="row vis-row">
          <span class="row-lbl">Log gesture feedback</span>
          <input type="checkbox" checked={logOn} onchange={(e) => toggleLog((e.target as HTMLInputElement).checked)} />
        </label>
        <p class="data-note">
          Records each stroke the gesture model classifies and what you did next (kept, undone,
          erased, redrawn, toolbox choice) to find misrecognitions. Stays on this device until you
          export it.
        </p>
        {#if logStats}
          <div class="data-stats">
            <div><b>{logStats.total}</b><span>gestures logged</span></div>
            <div><b>{logStats.suspected}</b><span>likely misread</span></div>
            <div><b>{logStats.review}</b><span>need review</span></div>
            <div><b>{logStats.pending}</b><span>still watching</span></div>
          </div>
          {#if Object.keys(logStats.byRule).length > 0}
            <div class="data-rules">
              {#each Object.entries(logStats.byRule).sort((a, b) => b[1] - a[1]) as [rule, n]}
                <span>{rule} · {n}</span>
              {/each}
            </div>
          {/if}
        {/if}
        <button class="reset" onclick={exportLog}><i class="bx bx-download"></i> Export log (JSONL)</button>
        <button class="reset" onclick={clearLog}><i class="bx bx-trash"></i> Clear log</button>

      {:else}
        <div class="row">
          <span class="row-lbl">Theme</span>
          <button class="theme-btn" onclick={() => theme.toggle()}>
            <i class="bx {theme.current === 'dark' ? 'bx-moon' : 'bx-sun'}"></i>
            {theme.current === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>

        <!-- page layout: grid style + cell/line spacing -->
        <div class="col">
          <span class="row-lbl">Page layout</span>
          <div class="grid-styles">
            <button class:on={grid.style === 'square'} onclick={() => grid.setStyle('square')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                <line x1="2" y1="8" x2="22" y2="8" /><line x1="2" y1="16" x2="22" y2="16" />
                <line x1="8" y1="2" x2="8" y2="22" /><line x1="16" y1="2" x2="16" y2="22" />
              </svg>
              Grid
            </button>
            <button class:on={grid.style === 'line'} onclick={() => grid.setStyle('line')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                <line x1="2" y1="7" x2="22" y2="7" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="17" x2="22" y2="17" />
              </svg>
              Lines
            </button>
          </div>
        </div>

        <div class="col">
          <span class="row-lbl">{grid.style === 'square' ? 'Grid size' : 'Line spacing'}</span>
          <div class="slide-row">
            <input
              type="range"
              min={CONFIG.MIN_GRID_SIZE}
              max={CONFIG.MAX_GRID_SIZE}
              step="1"
              value={grid.size}
              oninput={(e) => grid.setSize(Number((e.target as HTMLInputElement).value))}
            />
            <input
              class="num"
              type="number"
              min={CONFIG.MIN_GRID_SIZE}
              max={CONFIG.MAX_GRID_SIZE}
              step="1"
              value={grid.size}
              oninput={(e) => grid.setSize(Number((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>

        <!-- background + gridline colors (custom, or follow theme) -->
        <div class="col">
          <div class="cc-head">
            <span class="row-lbl">Background &amp; grid color</span>
            {#if grid.bgColor !== null || grid.lineColor !== null}
              <button class="cc-reset" onclick={() => { grid.setBgColor(null); grid.setLineColor(null); }}>
                Follow theme
              </button>
            {/if}
          </div>
          <div class="cc-row">
            <span class="cc-lbl">Background</span>
            <ColorField
              value={grid.bgColor ?? grid.resolvedBg}
              label="Background color"
              onchange={(c) => grid.setBgColor(c)}
            />
          </div>
          <div class="cc-row">
            <span class="cc-lbl">Grid line</span>
            <ColorField
              value={grid.lineColor ?? '#888888'}
              label="Grid line color"
              onchange={(c) => grid.setLineColor(c)}
            />
          </div>
        </div>

        <!-- editable toolbar quick colors -->
        <div class="col">
          <span class="row-lbl">Toolbar colors</span>
          <div class="quick-colors">
            {#each tools.quickColors as c, i (i)}
              <ColorField value={c} label="Toolbar color {i + 1}" onchange={(col) => tools.setQuickColor(i, col)} />
            {/each}
          </div>
        </div>

        <div class="col">
          <span class="row-lbl">Eraser size</span>
          <StrokeSize
            value={tools.eraserSize}
            color="var(--surface-fg-muted)"
            min={5}
            max={80}
            step={1}
            onchange={(v) => tools.setEraserSize(v)}
          />
        </div>

        <div class="col">
          <span class="row-lbl">Pen size</span>
          <StrokeSize
            value={tools.penSize}
            color={tools.penColor}
            onchange={(v) => tools.setPenSize(v)}
          />
        </div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .gear {
    position: fixed; top: 16px; right: 64px; z-index: 60;
    width: 40px; height: 40px; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--surface-panel); border: 1px solid var(--border);
    box-shadow: var(--shadow-md); color: var(--surface-fg); font-size: 1.2rem;
  }
  .gear:hover { color: var(--surface-fg); }

  .backdrop { position: fixed; inset: 0; z-index: 119; background: var(--scrim); animation: fade var(--dur-fast); }
  @keyframes fade { from { opacity: 0; } }
  .panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 94vw); z-index: 120;
    /* same frosted-glass treatment as the notebook shelf, for consistency */
    background: color-mix(in oklab, var(--surface-panel) 96%, transparent);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    border-left: 1px solid var(--border); box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column; font-family: var(--font-ui);
    animation: slideIn var(--dur-base) var(--ease-out);
  }
  @keyframes slideIn { from { transform: translateX(100%); } }
  header {
    display: flex; align-items: center; justify-content: space-between; padding: 16px;
    border-bottom: 1px solid var(--divider); font-size: 1rem; font-weight: 600; color: var(--surface-fg);
  }
  header span { display: flex; align-items: center; gap: 8px; }
  header i { color: var(--surface-fg); }
  .x { width: 30px; height: 30px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--surface-fg-muted); }
  .x:hover { background: var(--surface-raised); color: var(--surface-fg); }

  .tabs { display: flex; padding: 8px 12px 0; gap: 4px; border-bottom: 1px solid var(--divider); }
  .tabs button {
    flex: 1; padding: 9px; border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    color: var(--surface-fg-muted); font-size: 0.85rem; font-weight: 500; border-bottom: 2px solid transparent;
  }
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }

  .body { flex: 1; overflow-y: auto; padding: 14px; }
  .sync { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 0.85rem; color: var(--surface-fg-muted); }

  .default-pen {
    padding: 12px; margin-bottom: 16px; border-radius: var(--radius-md);
    background: var(--surface-bg); border: 1px solid var(--border);
  }
  .dp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .dp-title { flex: 1; display: flex; align-items: center; gap: 7px; font-size: 0.92rem; font-weight: 600; color: var(--surface-fg); }
  .dp-title i { color: var(--accent); }
  .default-pen .hint { margin: 10px 0 0; }

  .mod { padding: 10px; margin-bottom: 10px; border-radius: var(--radius-md); background: var(--surface-bg); }
  .mod-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .mod-name { flex: 1; font-size: 0.9rem; font-weight: 500; color: var(--surface-fg); }
  .vis { display: grid; place-items: center; cursor: pointer; }
  .vis input { display: none; }
  .vis i { font-size: 1.15rem; color: var(--surface-fg-muted); }

  .hint {
    display: flex; align-items: flex-start; gap: 7px;
    margin: 0 0 12px; padding: 9px 11px; border-radius: var(--radius-md);
    background: var(--accent-soft); color: var(--accent);
    font-size: 0.8rem; line-height: 1.4;
  }
  .hint i { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
  .box-picker {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 14px;
  }
  .bp {
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 9px 4px; border-radius: var(--radius-md);
    background: var(--surface-bg); border: 1px solid transparent;
    color: var(--surface-fg-muted); font-size: 0.72rem; font-weight: 500;
    transition: background var(--dur-fast), border-color var(--dur-fast);
  }
  .bp img { width: 30px; height: 30px; object-fit: contain; }
  .bp i { font-size: 1.5rem; }
  .bp:hover { background: var(--surface-raised); }
  .bp.active {
    background: var(--accent-soft); border-color: var(--accent); color: var(--accent);
  }

  /* radial preview — mirrors RadialToolbox.svelte */
  .radial {
    position: relative; width: 100%; height: 250px; margin: 10px 0 16px;
    display: grid; place-items: center; overflow: visible;
  }
  .r-center { width: 16px; height: 16px; border-radius: 50%; background: var(--surface-fg); opacity: 0.18; }
  .r-tool {
    position: absolute; left: 50%; top: 50%;
    width: 46px; height: 46px; margin: -23px 0 0 -23px;
    display: grid; place-items: center; border-radius: 50%;
    background: var(--surface-panel); border: 2px solid var(--c); box-shadow: var(--shadow-sm);
    /* the unselected tools sit slightly dimmed so the selected one pops */
    transform: translate(var(--x), var(--y)) scale(0.86);
    opacity: 0.7;
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms, box-shadow 200ms;
  }
  .r-tool i { font-size: 1.2rem; color: var(--c); }
  /* the tool being edited scales up + pulses to stand out. It KEEPS its own color
     (border + icon stay var(--c)) so you see the live result of your edits — the
     selection hint is size + a neutral halo, never a recolor. */
  .r-tool.sel {
    transform: translate(var(--x), var(--y)) scale(1.5);
    opacity: 1;
    box-shadow: var(--shadow-lg), 0 0 0 4px var(--accent-soft);
    z-index: 2;
    animation: toolPulse 1.8s ease-in-out infinite;
  }
  @keyframes toolPulse {
    0%, 100% { box-shadow: var(--shadow-lg), 0 0 0 4px var(--accent-soft); }
    50% { box-shadow: var(--shadow-lg), 0 0 0 7px color-mix(in oklab, var(--accent) 22%, transparent); }
  }
  .r-tool.tape { background: linear-gradient(135deg, var(--c), color-mix(in oklab, var(--c) 50%, white)); border-color: transparent; }
  .r-tool.tape i { color: var(--surface-panel); }

  .slot-editor {
    padding: 12px; border-radius: var(--radius-md); background: var(--surface-bg);
    display: flex; flex-direction: column; gap: 10px;
  }
  .se-row { display: flex; align-items: center; gap: 10px; }
  .se-col { display: flex; flex-direction: column; gap: 6px; }
  .se-lbl { font-size: 0.82rem; color: var(--surface-fg-muted); min-width: 64px; }
  .se-row select, .slot-editor select {
    flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-panel); color: var(--surface-fg); font-size: 0.84rem;
  }
  .vis-row { cursor: pointer; }
  .vis-row input { margin-left: auto; }

  .reset {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 14px; padding: 10px; border-radius: var(--radius-md);
    color: var(--surface-fg-muted); border: 1px solid var(--border);
  }
  .reset:hover { background: var(--surface-raised); color: var(--surface-fg); }

  .row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--divider); }
  .data-note { margin: 10px 0; font-size: 0.8rem; line-height: 1.45; color: var(--surface-fg-muted); }
  .data-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 8px 0; }
  .data-stats div {
    display: flex; flex-direction: column; gap: 2px; padding: 10px;
    border-radius: var(--radius-md); background: var(--surface-raised);
  }
  .data-stats b { font-size: 1.1rem; color: var(--surface-fg); }
  .data-stats span { font-size: 0.75rem; color: var(--surface-fg-muted); }
  .data-rules { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .data-rules span {
    font-size: 0.72rem; padding: 3px 8px; border-radius: var(--radius-pill);
    background: var(--surface-raised); color: var(--surface-fg-muted);
  }
  .col { display: flex; flex-direction: column; gap: 8px; padding: 14px 0; border-bottom: 1px solid var(--divider); }
  .row-lbl { font-size: 0.88rem; color: var(--surface-fg); font-weight: 500; }
  .theme-btn {
    margin-left: auto; display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: var(--radius-pill);
    background: var(--surface-raised); color: var(--surface-fg); font-size: 0.85rem;
  }
  .theme-btn:hover { background: var(--surface-bg); }
  .theme-btn i { font-size: 1.05rem; color: var(--surface-fg-muted); }

  .grid-styles { display: flex; gap: 8px; }
  .grid-styles button {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 12px; border-radius: var(--radius-md);
    background: var(--surface-bg); border: 1px solid var(--border);
    color: var(--surface-fg-muted); font-size: 0.8rem;
  }
  .grid-styles button svg { width: 30px; height: 30px; }
  .grid-styles button:hover { background: var(--surface-raised); }
  .grid-styles button.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }

  .slide-row { display: flex; align-items: center; gap: 10px; }
  .slide-row input[type='range'] { flex: 1; accent-color: var(--accent); }
  .slide-row .num {
    width: 58px; padding: 5px 7px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-bg); color: var(--surface-fg); font-size: 0.84rem; font-variant-numeric: tabular-nums;
  }

  .quick-colors { display: flex; gap: 10px; }

  .cc-head { display: flex; align-items: center; justify-content: space-between; }
  .cc-reset {
    font-size: 0.74rem; color: var(--accent); padding: 3px 8px;
    border-radius: var(--radius-pill); background: var(--accent-soft);
  }
  .cc-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .cc-lbl { font-size: 0.84rem; color: var(--surface-fg-muted); }
</style>
