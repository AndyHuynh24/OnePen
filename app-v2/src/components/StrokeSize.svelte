<script lang="ts">
  // Stroke-size control: a slider + a number input (both edit the value), plus a
  // live thickness preview drawn at the SAME width the canvas uses at 100% zoom
  // (lineWidth = size, see drawStroke()) so it's an accurate representation of the stroke.
  interface Props {
    value: number;
    color?: string;
    min?: number;
    max?: number;
    step?: number;
    onchange: (v: number) => void;
  }
  let { value, color = '#888', min = 0.4, max = 8, step = 0.1, onchange }: Props = $props();


  function clamp(v: number): number {
    if (Number.isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }
  function set(v: number) {
    onchange(clamp(Math.round(v * 100) / 100));
  }

  // a CSS color (var(--…) or hex) works directly as the preview line color
  const lineW = $derived(Math.max(1, value));
</script>

<div class="ss">
  <div class="ss-preview" aria-hidden="true">
    <div class="ss-line" style="height: {lineW}px; background: {color};"></div>
  </div>
  <input
    class="ss-slider"
    type="range"
    {min}
    {max}
    {step}
    {value}
    oninput={(e) => set(Number((e.target as HTMLInputElement).value))}
    aria-label="Stroke size"
  />
  <input
    class="ss-num"
    type="number"
    {min}
    {max}
    {step}
    {value}
    oninput={(e) => set(Number((e.target as HTMLInputElement).value))}
    aria-label="Stroke size value"
  />
</div>

<style>
  .ss { display: flex; align-items: center; gap: 10px; }
  .ss-preview {
    width: 64px; height: 30px; flex-shrink: 0;
    display: grid; place-items: center;
    background: var(--surface-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .ss-line {
    width: 80%;
    border-radius: 999px;
    min-height: 1px;
  }
  .ss-slider { flex: 1; min-width: 0; accent-color: var(--accent); }
  .ss-num {
    width: 58px; flex-shrink: 0;
    padding: 5px 7px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-bg); color: var(--surface-fg); font-size: 0.84rem;
    font-variant-numeric: tabular-nums;
  }
  .ss-num:focus { outline: none; border-color: var(--accent); }
</style>
