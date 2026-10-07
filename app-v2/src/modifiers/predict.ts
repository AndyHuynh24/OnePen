// ─────────────────────────────────────────────────────────────────────────────
// Gesture classification. The (unchanged) hybrid CNN + geometric model runs in
// a Web Worker (predict.worker.ts) so it can never block pen input; this side
// sends the 96×96 raster + the 12-D features and applies the same thresholds,
// ranking + fallback decision as app/predict.js.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkerRequest, WorkerResponse } from './predict.worker';
import type { Point } from '$types/geometry';
import { CONFIG } from '$config/constants';
import { CLASSES, STROKE_TYPE, type StrokeType } from '$config/strokeTypes';
import { computeStrokeFeatures } from './features';

let worker: Worker | null = null;
let loaded = false;
let loadPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, (r: WorkerResponse) => void>();

function settle(r: WorkerResponse) {
  const done = pending.get(r.id);
  pending.delete(r.id);
  done?.(r);
}

/** Ask the worker; always resolves (a crashed worker or a stuck call answers
 *  ok:false), so a stroke waiting on a prediction can never hang. */
function call(
  req: WorkerRequest,
  transfer: Transferable[] = [],
  timeoutMs = 0,
): Promise<WorkerResponse> {
  if (!worker) {
    worker = new Worker(new URL('./predict.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => settle(e.data);
    worker.onerror = (e) => {
      for (const id of [...pending.keys()]) settle({ id, ok: false, error: e.message || 'worker error' });
      worker = null;
      loaded = false;
      loadPromise = null;
    };
  }
  return new Promise((resolve) => {
    pending.set(req.id, resolve);
    worker!.postMessage(req, transfer);
    if (timeoutMs > 0) setTimeout(() => settle({ id: req.id, ok: false, error: 'timeout' }), timeoutMs);
  });
}

/** Which version of the model produced a prediction (the bundled one until
 *  models are served from the retraining pipeline). */
export const MODEL_VERSION = 'bundled-1';

export interface PredictionData {
  stroke: Point[];
  predictedLabel: StrokeType;
  confidence: number;
  probabilities: number[];
  /** the 12-D geometric features the model was fed */
  features: number[];
  /** how the label was chosen: top class over its threshold, a lower-ranked
   *  class over ITS threshold, or nothing cleared a threshold (→ none) */
  decision: 'threshold' | 'fallback' | 'below';
  modelVersion: string;
  timestamp: number;
}

let lastPredictionData: PredictionData | null = null;
export function getLastPredictionData(): PredictionData | null {
  return lastPredictionData;
}

export function isModelLoaded(): boolean {
  return loaded;
}

/** Load (and warm up) the model in the worker, once. Safe to call repeatedly. */
export function loadModel(modelUrl = '/tfjs/model.json'): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const url = new URL(modelUrl, location.href).href; // the worker resolves from its own URL
    const r = await call({ id: nextId++, type: 'load', url });
    if (!r.ok) {
      console.error('[predict] model load failed:', r.error);
      loadPromise = null; // allow a retry
      throw new Error(r.error);
    }
    loaded = true;
    console.log('[predict] model loaded + warmed up (worker)');
  })();
  return loadPromise;
}

/**
 * Classify a stroke. `canvas` is the 96×96 raster from rasterizeStroke().
 * Returns the final stroke-type label (or NONE if below threshold / no model).
 */
export async function predictImageFromCanvas(
  stroke: Point[],
  canvas: HTMLCanvasElement,
): Promise<StrokeType> {
  if (!loaded) return STROKE_TYPE.NONE;

  try {
    const features = computeStrokeFeatures(stroke);
    const ctx = canvas.getContext('2d');
    if (!ctx) return STROKE_TYPE.NONE;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r = await call({ id: nextId++, type: 'predict', pixels, features }, [pixels.data.buffer], 4000);
    if (!r.ok || !r.probs) throw new Error(r.ok ? 'no output' : r.error);
    const probs = r.probs;

    const ranked = probs
      .map((prob, idx) => ({ label: CLASSES[idx], prob }))
      .sort((a, b) => b.prob - a.prob);

    const best = ranked[0];
    const threshold = thresholdFor(best.label);

    let finalLabel: StrokeType = STROKE_TYPE.NONE;
    let finalConfidence = best.prob;
    let decision: PredictionData['decision'] = 'below';

    if (best.prob >= threshold) {
      finalLabel = best.label;
      decision = 'threshold';
    } else {
      const fallback = ranked.find((r) => r.prob >= thresholdFor(r.label));
      if (fallback) {
        finalLabel = fallback.label;
        finalConfidence = fallback.prob;
        decision = 'fallback';
      }
    }

    lastPredictionData = {
      stroke,
      predictedLabel: finalLabel,
      confidence: finalConfidence,
      probabilities: probs,
      features,
      decision,
      modelVersion: MODEL_VERSION,
      timestamp: performance.now(),
    };

    return finalLabel;
  } catch (err) {
    console.error('[predict] prediction failed:', err);
    return STROKE_TYPE.NONE;
  }
}

function thresholdFor(label: StrokeType): number {
  const t = CONFIG.CLASS_THRESHOLDS as Record<string, number>;
  return t[label] ?? 0.6;
}
