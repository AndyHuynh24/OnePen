// ─────────────────────────────────────────────────────────────────────────────
// Gesture-model worker. TF.js runs HERE, never on the main thread: loading the
// model compiles GPU shaders and every inference executes the whole graph, and
// both used to block the thread that handles the pen — the ink froze for
// seconds at startup and stuttered after each gesture-sized stroke.
// The main thread (predict.ts) sends the 96×96 raster + features and gets the
// class probabilities back; it never waits on the model to draw.
// ─────────────────────────────────────────────────────────────────────────────

import * as tf from '@tensorflow/tfjs';

export type WorkerRequest =
  | { id: number; type: 'load'; url: string }
  | { id: number; type: 'predict'; pixels: ImageData; features: number[] };

export type WorkerResponse =
  | { id: number; ok: true; probs?: number[] }
  | { id: number; ok: false; error: string };

let model: tf.GraphModel | null = null;

async function pickBackend(): Promise<void> {
  // WebGL in a worker needs OffscreenCanvas (Chrome, Edge, Safari 16.4+); if it
  // isn't available the CPU backend is plenty for one small CNN off-thread.
  try {
    if (await tf.setBackend('webgl')) return;
  } catch {
    /* fall through */
  }
  await tf.setBackend('cpu');
}

function run(pixels: ImageData | null, features: number[]): tf.Tensor {
  return tf.tidy(() => {
    const img = pixels
      ? tf.browser.fromPixels(pixels).resizeBilinear([96, 96]).toFloat().div(255).expandDims(0)
      : tf.ones([1, 96, 96, 3]);
    const feat = tf.tensor2d([features], [1, features.length]);
    return model!.predict({ img_input: img, feature_input: feat }) as tf.Tensor;
  });
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  const reply = (r: WorkerResponse) => (self as unknown as Worker).postMessage(r);
  try {
    if (msg.type === 'load') {
      await pickBackend();
      model = await tf.loadGraphModel(msg.url);
      // warm-up: the first inference compiles every kernel — pay it now, here
      const out = run(null, new Array(12).fill(0));
      await out.data();
      out.dispose();
      reply({ id: msg.id, ok: true });
    } else {
      if (!model) throw new Error('model not loaded');
      const out = run(msg.pixels, msg.features);
      const probs = Array.from(await out.data());
      out.dispose();
      reply({ id: msg.id, ok: true, probs });
    }
  } catch (err) {
    reply({ id: msg.id, ok: false, error: String(err) });
  }
};
