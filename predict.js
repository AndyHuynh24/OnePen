let model = null;
let autoShapeModel = null;


async function preloadModel(model) {
  try {
    // --- Auto-detect input shapes ---
    const inputs = model.inputs;
    const numInputs = inputs.length;

    // Find image input shape (e.g. [null, 136, 136, 3])
    const imgInput = inputs.find(inp => inp.shape.length === 4);
    const featInput = inputs.find(inp => inp.shape.length === 2);

    const imgSize = imgInput ? imgInput.shape[1] || 136 : 136;
    const featDim = featInput ? featInput.shape[1] || 10 : 0;

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
    model = await tf.loadGraphModel('MobileNetV3_HybridModelV2_exp/model.json');
    autoShapeModel = await tf.loadGraphModel('autoShapeModel/model.json');
    console.log("✅ Model loaded successfully!");
  } catch (err) {
    console.error("❌ Error loading model:", err);
    alert("Failed to load model: " + err.message);
  } finally {
    preloadModel(model);
    preloadModel(autoShapeModel);
  }
  return {model, autoShapeModel};
}
function computeFastStrokeFeatures(rawStroke, normStroke, heightThreshold = 45, capValue = 100) {
  if (!rawStroke || rawStroke.length < 2 || !normStroke || normStroke.length < 2)
    return new Array(10).fill(0);

  // === Extract coordinates ===
  const n = rawStroke.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = rawStroke[i].x;
    y[i] = rawStroke[i].y;
  }

  const xMin = Math.min(...x);
  const xMax = Math.max(...x);
  const yMin = Math.min(...y);
  const yMax = Math.max(...y);
  const w = Math.max(xMax - xMin, 1e-6);
  const h = Math.max(yMax - yMin, 1e-6);
  const bboxArea = w * h;
  const diag = Math.sqrt(w * w + h * h);

  // === Segment deltas & lengths ===
  let totalLen = 0;
  const deltas = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = x[i + 1] - x[i];
    const dy = y[i + 1] - y[i];
    const len = Math.sqrt(dx * dx + dy * dy);
    totalLen += len;
    deltas[i] = [dx, dy];
  }

  // === Core geometric features ===
  const perimDiagRatio = (2 * (w + h)) / (diag + 1e-6);
  const heightDiff45 = Math.max(-1, Math.min(1, (h - heightThreshold) / capValue));
  const directionBias = Math.abs(w - h) / (w + h + 1e-6);
  const compactness = totalLen / (diag + 1e-6);

  // === Density & variance ===
  const density = n / (bboxArea + 1e-6);
  const logDensity = Math.log1p(density);
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let vertVarSum = 0;
  for (let i = 0; i < n; i++) {
    const d = y[i] - meanY;
    vertVarSum += d * d;
  }
  const vertVar = Math.sqrt(vertVarSum / n);

  // === Edge fraction (normalized) ===
  const xn = normStroke.map(p => p.x);
  const yn = normStroke.map(p => p.y);
  const xMinN = Math.min(...xn);
  const xMaxN = Math.max(...xn);
  const yMinN = Math.min(...yn);
  const yMaxN = Math.max(...yn);
  const edgeThresh = 0.1 * Math.max(xMaxN - xMinN, yMaxN - yMinN);
  let edgeCount = 0;
  for (let i = 0; i < xn.length; i++) {
    const dEdge = Math.min(
      xn[i] - xMinN,
      xMaxN - xn[i],
      yn[i] - yMinN,
      yMaxN - yn[i]
    );
    if (dEdge < edgeThresh) edgeCount++;
  }
  const edgeFrac = edgeCount / xn.length;

  // === Spine verticality ===
  const dxSpine = x[n - 1] - x[0];
  const dySpine = y[n - 1] - y[0];
  const angle = Math.abs(Math.atan2(dySpine, dxSpine));
  const spineVerticality = 1 - Math.abs(angle - Math.PI / 2) / (Math.PI / 2);

  // === Rectilinearity ===
  let rectilinearity = 0;
  if (deltas.length > 1) {
    const angles = deltas.map(([dx, dy]) => Math.atan2(dy, dx));
    let rectCount = 0;
    for (let i = 0; i < angles.length - 1; i++) {
      let diff = Math.abs(angles[i + 1] - angles[i]);
      diff = Math.min(diff, Math.PI - diff); // wrap-around
      if (diff < 0.2 || Math.abs(diff - Math.PI / 2) < 0.2) rectCount++;
    }
    rectilinearity = rectCount / (angles.length - 1);
  }

  // === Return final 10D feature vector ===
  return [
    perimDiagRatio,      // 1
    heightDiff45,        // 2
    directionBias,       // 3
    compactness,         // 4
    edgeFrac,            // 5
    spineVerticality,    // 6
    logDensity,          // 7
    vertVar,             // 8
    totalLen,            // 9
    rectilinearity       // 10
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

const STROKE_TYPE = Object.freeze({
  UNDERLINE: "underline",
  BOX: "box",
  CURLY: "curly",
  DELETE: "delete",
  BOXS: "boxshortcut",
  CURLYS: "curlyshortcut",
  CIRCLES: "circleshortcut",
  HIGHLIGHT: "highlight",
  MOVE: "move",
  NONE: "none",
});

const CLASSES = [
  STROKE_TYPE.UNDERLINE,
  STROKE_TYPE.BOX,
  STROKE_TYPE.CURLY,
  STROKE_TYPE.DELETE,
  STROKE_TYPE.BOXS,
  STROKE_TYPE.CURLYS,
  STROKE_TYPE.CIRCLES,
  STROKE_TYPE.NONE,
  STROKE_TYPE.NONE,
  STROKE_TYPE.NONE,
];

const CLASS_THRESHOLDS = {
  underline: 0.65,
  box: 0.8,
  curly: 0.65,
  delete: 0.50,
  boxshortcut: 0.65,
  curlyshortcut: 0.65,
  circleshortcut: 0.65,
  nonedot: 0.6,
  nonedaulon: 0.6,
  nonenhon: 0.6,
};

async function predictImageFromCanvas(stroke, canvas, model) {
  let imgTensor, featureTensor;

  try {
    /* ---------- 1️⃣ Feature tensor ---------- */
    const normStroke = normalizeStroke(stroke);
    const features = computeFastStrokeFeatures(stroke, normStroke);
    featureTensor = tf.tensor2d([features], [1, features.length]);

    /* ---------- 2️⃣ Image tensor ---------- */
    imgTensor = tf.tidy(() =>
      tf.browser
        .fromPixels(canvas)
        .resizeBilinear([136, 136])
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

    /* ---------- 4️⃣ Rank predictions ---------- */
    const ranked = probs
      .map((prob, idx) => ({ label: CLASSES[idx], prob }))
      .sort((a, b) => b.prob - a.prob);

    const best = ranked[0];
    const threshold = CLASS_THRESHOLDS[best.label] ?? 0.6;

    /* ---------- 5️⃣ Decision ---------- */
    if (best.prob >= threshold) {
      console.log(
        `Predicted: ${best.label} (${best.prob.toFixed(3)})`
      );
      return best.label;
    }

    const fallback = ranked.find(
      r => r.prob >= (CLASS_THRESHOLDS[r.label] ?? 0.6)
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

