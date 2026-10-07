// ─────────────────────────────────────────────────────────────────────────────
// Lightweight live-draw perf counters, read by <PerfHud> for diagnosis.
// TEMPORARY — remove once the stroke-latency investigation is done.
// ─────────────────────────────────────────────────────────────────────────────

export const perf = {
  events: 0, // pointer-draw events handled this window
  totalMs: 0, // total time spent in the draw handler this window
  maxMs: 0, // slowest single draw-handler call this window
  samples: 0, // total points drawn this window (coalesced expansion)

  // per-stroke pen-up cost, split into its two halves
  commitN: 0,
  captureMs: 0, // history.capture() — the undo snapshot
  captureMax: 0,
  classifyMs: 0, // classifyStroke() synchronous portion — the gesture geometry/AI
  classifyMax: 0,
  // draw-layer render cost (full redraw vs cheap append shows up here)
  renderN: 0,
  renderMs: 0,
  renderMax: 0,

  record(ms: number, sampleCount: number) {
    this.events++;
    this.totalMs += ms;
    if (ms > this.maxMs) this.maxMs = ms;
    this.samples += sampleCount;
  },
  recordCommit(captureMs: number, classifyMs: number) {
    this.commitN++;
    this.captureMs += captureMs;
    if (captureMs > this.captureMax) this.captureMax = captureMs;
    this.classifyMs += classifyMs;
    if (classifyMs > this.classifyMax) this.classifyMax = classifyMs;
  },
  recordRender(ms: number) {
    this.renderN++;
    this.renderMs += ms;
    if (ms > this.renderMax) this.renderMax = ms;
  },
  reset() {
    this.events = 0;
    this.totalMs = 0;
    this.maxMs = 0;
    this.samples = 0;
    this.commitN = 0;
    this.captureMs = 0;
    this.captureMax = 0;
    this.classifyMs = 0;
    this.classifyMax = 0;
    this.renderN = 0;
    this.renderMs = 0;
    this.renderMax = 0;
  },
};
