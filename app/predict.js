let model = null;
let autoShapeModel = null;

// ═══════════════════════════════════════════════════════════════════════════
// INFERENCE TIMING TRACKER
// ═══════════════════════════════════════════════════════════════════════════
const inferenceTimer = {
  times: [],
  maxSamples: 100,

  record(ms) {
    this.times.push(ms);
    if (this.times.length > this.maxSamples) {
      this.times.shift();
    }
  },

  getStats() {
    if (this.times.length === 0) return null;
    const sorted = [...this.times].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      samples: sorted.length
    };
  },

  log() {
    const stats = this.getStats();
    if (!stats) return;
    console.log(
      `[Inference] Avg: ${stats.avg.toFixed(2)}ms | ` +
      `Median: ${stats.median.toFixed(2)}ms | ` +
      `Min: ${stats.min.toFixed(2)}ms | ` +
      `Max: ${stats.max.toFixed(2)}ms | ` +
      `(${stats.samples} samples)`
    );
  }
};

// Log stats every 10 predictions
let predictionCount = 0;

// Expose globally for console access
window.getInferenceStats = () => {
  const stats = inferenceTimer.getStats();
  if (!stats) {
    console.log('[Inference] No data yet. Draw some gestures first!');
    return null;
  }
  console.log('═══════════════════════════════════════════');
  console.log('        INFERENCE TIME STATISTICS          ');
  console.log('═══════════════════════════════════════════');
  console.log(`  Average:  ${stats.avg.toFixed(2)} ms`);
  console.log(`  Median:   ${stats.median.toFixed(2)} ms`);
  console.log(`  Min:      ${stats.min.toFixed(2)} ms`);
  console.log(`  Max:      ${stats.max.toFixed(2)} ms`);
  console.log(`  Samples:  ${stats.samples}`);
  console.log('═══════════════════════════════════════════');
  return stats;
};

async function preloadModel(model) {
  try {
    // --- Auto-detect input shapes ---
    const inputs = model.inputs;
    const numInputs = inputs.length;

    // Find image input shape (e.g. [null, 136, 136, 3])
    const imgInput = inputs.find(inp => inp.shape.length === 4);
    const featInput = inputs.find(inp => inp.shape.length === 2);

    const imgSize = imgInput ? imgInput.shape[1] || 136 : 136;
    const featDim = featInput ? featInput.shape[1] || 12 : 0;

    // --- Create blank image tensor ---
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = imgSize;
    tempCanvas.height = imgSize;
    const ctx = tempCanvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, imgSize, imgSize);

    const imgTensor = tf.tidy(() =>
      tf.browser.fromPixels(tempCanvas)
        .resizeBilinear([imgSize, imgSize])
        .toFloat()
        .div(255.0)
        .expandDims(0) // [1, imgSize, imgSize, 3]
    );

    // --- Create dummy feature tensor (if needed) ---
    const featureTensor = featDim > 0 ? tf.zeros([1, featDim]) : null;

    // --- Perform dummy prediction ---
    if (numInputs === 1) {
      await model.predict(imgTensor);
    } else if (numInputs === 2) {
      await model.predict([imgTensor, featureTensor]);
    } else {
      console.warn(`⚠️ Unexpected model input count: ${numInputs}`);
    }

    console.log("✅ Model preloaded successfully (blank inference).");
  } catch (err) {
    console.error("❌ Model preload failed:", err);
  } finally {
    // Cleanup tensors safely
    tf.disposeVariables();
    tf.engine().startScope();
    tf.engine().endScope();
  }
}


async function loadModel() {
  //welcome.innerHTML = 'Welcome ' + userName; 
  try {
    model = await tf.loadGraphModel('tfjs/model.json');
    console.log("✅ Model loaded successfully!");
  } catch (err) {
    console.error("❌ Error loading model:", err);
    alert("Failed to load model: " + err.message);
  } finally {
    preloadModel(model);
    //preloadModel(autoShapeModel);
  }
  return {model, autoShapeModel};
}
function computeFastStrokeFeatures(
  rawStroke,
  heightThreshold = 45,
  capValue = 100
) {
  if (!rawStroke || rawStroke.length < 2) {
    return new Array(12).fill(0);
  }

  // Filter out points with invalid (non-finite) x or y values
  const validStroke = rawStroke.filter(p => 
    Number.isFinite(p.x) && Number.isFinite(p.y)
  );

  // Log if we filtered out any invalid points
  if (validStroke.length < rawStroke.length) {
    console.warn(`Filtered out ${rawStroke.length - validStroke.length} invalid points from stroke`);
  }

  // Need at least 2 valid points to compute features
  if (validStroke.length < 2) {
    console.warn("Not enough valid points in stroke after filtering");
    return new Array(12).fill(0);
  }

  // Use the filtered valid stroke for all computations
  rawStroke = validStroke;

  const n = rawStroke.length;

  // === Extract coordinates ===
  const x = new Array(n);
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = rawStroke[i].x;
    y[i] = rawStroke[i].y;
  }

  // === Bounding box ===
  const xMin = Math.min(...x);
  const xMax = Math.max(...x);
  const yMin = Math.min(...y);
  const yMax = Math.max(...y);
  const w = Math.max(xMax - xMin, 1e-6);
  const h = Math.max(yMax - yMin, 1e-6);
  const diag = Math.sqrt(w * w + h * h);

  // === Segment lengths ===
  let totalLen = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = x[i + 1] - x[i];
    const dy = y[i + 1] - y[i];
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  // === Feature 0: Closure ratio ===
  const endToStartDist = Math.sqrt(
    Math.pow(x[n - 1] - x[0], 2) +
    Math.pow(y[n - 1] - y[0], 2)
  );
  const closureRatio = 1 - Math.min(endToStartDist / (diag + 1e-6), 1.0);

  // === Feature 1: Compactness ===
  const compactness = totalLen / (diag + 1e-6);

  // === Feature 2: Spread ratio ===
  let centerX = 0;
  let centerY = 0;
  for (let i = 0; i < n; i++) {
    centerX += x[i];
    centerY += y[i];
  }
  centerX /= n;
  centerY /= n;

  let spreadSum = 0;
  let spreadSqSum = 0;
  for (let i = 0; i < n; i++) {
    const dist = Math.sqrt(
      Math.pow(x[i] - centerX, 2) +
      Math.pow(y[i] - centerY, 2)
    );
    spreadSum += dist;
    spreadSqSum += dist * dist;
  }
  const spreadMean = spreadSum / n;
  const spreadStd = Math.sqrt(
    spreadSqSum / n - spreadMean * spreadMean
  );
  const spreadRatio = spreadStd / (diag + 1e-6);

  // === Feature 3: Aspect ratio ===
  const aspectRatio = (2 * Math.atan(w / h)) / Math.PI;

  // === Feature 4: Edge fraction ===
  const edgeThresh = 0.1;
  let edgeCount = 0;
  for (let i = 0; i < n; i++) {
    const xNorm = (x[i] - xMin) / w;
    const yNorm = (y[i] - yMin) / h;
    const dEdge = Math.min(
      xNorm,
      1 - xNorm,
      yNorm,
      1 - yNorm
    );
    if (dEdge < edgeThresh) edgeCount++;
  }
  const edgeFrac = edgeCount / n;

  // === Feature 5: Number of points ===
  const numPoints = n;

  // === Feature 6: Height difference ===
  const heightDiff = Math.max(-1,Math.min(1, (h - heightThreshold) / capValue));

  // === Feature 7: Horizontal variance ===
  let xSum = 0;
  for (let i = 0; i < n; i++) xSum += x[i];
  const xMean = xSum / n;

  let xVarSum = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - xMean;
    xVarSum += d * d;
  }
  const horizVar = Math.sqrt(xVarSum / n);

  // === Feature 9: Perimeter to diagonal ratio ===
  const perimDiagRatio = (2 * (w + h)) / (diag + 1e-6);

  // === Feature 10: Spine verticality ===
  const dxSpine = x[n - 1] - x[0];
  const dySpine = y[n - 1] - y[0];
  const spineAngle = Math.abs(Math.atan2(dySpine, dxSpine));
  const spineVerticality = 1 - Math.abs(spineAngle - Math.PI / 2) / (Math.PI / 2);

  // === Feature 11: Vertical variance ===
  let ySum = 0;
  for (let i = 0; i < n; i++) ySum += y[i];
  const yMean = ySum / n;

  let yVarSum = 0;
  for (let i = 0; i < n; i++) {
    const d = y[i] - yMean;
    yVarSum += d * d;
  }
  const vertVar = Math.sqrt(yVarSum / n);

  // === Return final 12D feature vector ===
  console.log([
    closureRatio,     // 0
    compactness,      // 1
    spreadRatio,      // 2
    aspectRatio,      // 3
    edgeFrac,         // 4
    numPoints,        // 5
    heightDiff,       // 6
    horizVar,         // 7
    totalLen,         // 8
    perimDiagRatio,   // 9
    spineVerticality, // 10
    vertVar           // 11
  ]);

  return [
    closureRatio,     // 0
    compactness,      // 1
    spreadRatio,      // 2
    aspectRatio,      // 3
    edgeFrac,         // 4
    numPoints,        // 5
    heightDiff,       // 6
    horizVar,         // 7
    totalLen,         // 8
    perimDiagRatio,   // 9
    spineVerticality, // 10
    vertVar           // 11
  ];
}



function normalizeStroke(stroke) {
    if (!stroke || stroke.length === 0) return [];

    const xs = stroke.map(p => p.x);
    const ys = stroke.map(p => p.y);

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const w = xMax - xMin || 1e-6;
    const h = yMax - yMin || 1e-6;

    // Normalize each point into [0, 1] box
    return stroke.map(p => ({
        x: (p.x - xMin) / w,
        y: (p.y - yMin) / h,
        p: p.p ?? 0   // preserve pressure if available
    }));
}

// STROKE_TYPE, CLASSES, and CLASS_THRESHOLDS are now defined in config.js

async function predictImageFromCanvas(stroke, canvas, model) {
  let imgTensor, featureTensor;
  const t0 = performance.now();

  try {
    /* ---------- 1️⃣ Feature tensor ---------- */
    const normStroke = normalizeStroke(stroke);
    const features = computeFastStrokeFeatures(stroke);
    featureTensor = tf.tensor2d([features], [1, features.length]);

    /* ---------- 2️⃣ Image tensor ---------- */
    imgTensor = tf.tidy(() =>
      tf.browser
        .fromPixels(canvas)
        .resizeBilinear([96, 96])
        .toFloat()
        .div(255)
        .expandDims(0)
    );

    /* ---------- 3️⃣ Predict ---------- */
    const prediction = await model.predict({
      img_input: imgTensor,
      feature_input: featureTensor,
    });

    const probs = (await prediction.array())[0];

    /* ---------- ⏱️ Record inference time ---------- */
    const inferenceTime = performance.now() - t0;
    inferenceTimer.record(inferenceTime);
    predictionCount++;

    // Log stats every 10 predictions
    if (predictionCount % 10 === 0) {
      inferenceTimer.log();
    }

    /* ---------- 4️⃣ Rank predictions ---------- */
    const ranked = probs
      .map((prob, idx) => ({ label: CLASSES[idx], prob }))
      .sort((a, b) => b.prob - a.prob);

    const best = ranked[0];
    const threshold = CONFIG.CLASS_THRESHOLDS[best.label] ?? 0.6;

    /* ---------- 5️⃣ Decision ---------- */
    if (best.prob >= threshold) {
      console.log(
        `Predicted: ${best.label} (${best.prob.toFixed(3)})`
      );
      return best.label;
    }

    const fallback = ranked.find(
      r => r.prob >= (CONFIG.CLASS_THRESHOLDS[r.label] ?? 0.6)
    );

    if (fallback) {
      console.log(
        `Fallback: ${fallback.label} (${fallback.prob.toFixed(3)})`
      );
      return fallback.label;
    }

    console.log(
      `Prediction too low (max=${best.prob.toFixed(3)} @ ${best.label})`
    );
    return STROKE_TYPE.NONE;

  } catch (err) {
    console.error("❌ Prediction failed:", err);
    return STROKE_TYPE.NONE;

  } finally {
    imgTensor?.dispose();
    featureTensor?.dispose();
  }
}



async function predictShapeFromCanvas(canvas, model) {
    const threshold = 0.7; // fixed threshold for all classes

    const tensor = tf.tidy(() => {
        return tf.browser.fromPixels(canvas)
            .resizeBilinear([164, 164])
            .toFloat()
            .div(255.0)
            .expandDims(0);
    });

    try {
        const prediction = await model.predict(tensor);
        const predictionArray = (await prediction.array())[0];

        const maxProb = Math.max(...predictionArray);
        const predictedIdx = predictionArray.indexOf(maxProb);
        const classes = ['line', 'square', 'circle'];

        const probsStr = predictionArray.map(p => Number(p.toFixed(3))).join(', ');

        if (maxProb >= threshold) {
            console.log(`Predicted: ${classes[predictedIdx]} (Prob: ${probsStr})`);
            return predictedIdx;
        } else {
            console.log(`Prediction too low (Max Prob: ${maxProb}) — ${probsStr}`);
            return -1;
        }
    } finally {
        tensor.dispose();
    }
}

