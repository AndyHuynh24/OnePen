// ─────────────────────────────────────────────────────────────────────────────
// 12-D geometric feature vector for stroke classification.
// Numerical 1:1 port of computeFastStrokeFeatures() in app/predict.js. The
// output values MUST match the original byte-for-byte so the TF.js model
// (unchanged) keeps producing the same predictions.
// ─────────────────────────────────────────────────────────────────────────────

import type { Point } from '$types/geometry';

const ZERO_FEATURES: readonly number[] = Object.freeze(new Array(12).fill(0));

export function computeStrokeFeatures(
  rawStroke: Point[],
  heightThreshold = 45,
  capValue = 100,
): number[] {
  if (!rawStroke || rawStroke.length < 2) return [...ZERO_FEATURES];

  // Filter out points with non-finite coords (mirrors original).
  const stroke = rawStroke.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (stroke.length < 2) return [...ZERO_FEATURES];

  const n = stroke.length;
  const x = new Array<number>(n);
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    x[i] = stroke[i].x;
    y[i] = stroke[i].y;
  }

  // bounding box
  let xMin = x[0];
  let xMax = x[0];
  let yMin = y[0];
  let yMax = y[0];
  for (let i = 1; i < n; i++) {
    if (x[i] < xMin) xMin = x[i];
    if (x[i] > xMax) xMax = x[i];
    if (y[i] < yMin) yMin = y[i];
    if (y[i] > yMax) yMax = y[i];
  }
  const w = Math.max(xMax - xMin, 1e-6);
  const h = Math.max(yMax - yMin, 1e-6);
  const diag = Math.sqrt(w * w + h * h);

  // total path length
  let totalLen = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = x[i + 1] - x[i];
    const dy = y[i + 1] - y[i];
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  // 0 — closure ratio
  const endToStartDist = Math.sqrt(
    (x[n - 1] - x[0]) ** 2 + (y[n - 1] - y[0]) ** 2,
  );
  const closureRatio = 1 - Math.min(endToStartDist / (diag + 1e-6), 1.0);

  // 1 — compactness
  const compactness = totalLen / (diag + 1e-6);

  // 2 — spread ratio
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
    const d = Math.sqrt((x[i] - centerX) ** 2 + (y[i] - centerY) ** 2);
    spreadSum += d;
    spreadSqSum += d * d;
  }
  const spreadMean = spreadSum / n;
  const spreadStd = Math.sqrt(spreadSqSum / n - spreadMean * spreadMean);
  const spreadRatio = spreadStd / (diag + 1e-6);

  // 3 — aspect ratio
  const aspectRatio = (2 * Math.atan(w / h)) / Math.PI;

  // 4 — edge fraction
  const edgeThresh = 0.1;
  let edgeCount = 0;
  for (let i = 0; i < n; i++) {
    const xn = (x[i] - xMin) / w;
    const yn = (y[i] - yMin) / h;
    const dEdge = Math.min(xn, 1 - xn, yn, 1 - yn);
    if (dEdge < edgeThresh) edgeCount++;
  }
  const edgeFrac = edgeCount / n;

  // 5 — number of points
  const numPoints = n;

  // 6 — height difference
  const heightDiff = Math.max(-1, Math.min(1, (h - heightThreshold) / capValue));

  // 7 — horizontal variance
  let xSum = 0;
  for (let i = 0; i < n; i++) xSum += x[i];
  const xMean = xSum / n;
  let xVarSum = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - xMean;
    xVarSum += d * d;
  }
  const horizVar = Math.sqrt(xVarSum / n);

  // 8 — total length (re-used)
  // 9 — perimeter to diagonal ratio
  const perimDiagRatio = (2 * (w + h)) / (diag + 1e-6);

  // 10 — spine verticality
  const dxSpine = x[n - 1] - x[0];
  const dySpine = y[n - 1] - y[0];
  const spineAngle = Math.abs(Math.atan2(dySpine, dxSpine));
  const spineVerticality = 1 - Math.abs(spineAngle - Math.PI / 2) / (Math.PI / 2);

  // 11 — vertical variance
  let ySum = 0;
  for (let i = 0; i < n; i++) ySum += y[i];
  const yMean = ySum / n;
  let yVarSum = 0;
  for (let i = 0; i < n; i++) {
    const d = y[i] - yMean;
    yVarSum += d * d;
  }
  const vertVar = Math.sqrt(yVarSum / n);

  return [
    closureRatio,
    compactness,
    spreadRatio,
    aspectRatio,
    edgeFrac,
    numPoints,
    heightDiff,
    horizVar,
    totalLen,
    perimDiagRatio,
    spineVerticality,
    vertVar,
  ];
}

/** Normalize a stroke into a [0,1] x [0,1] box. Mirrors `normalizeStroke()`. */
export function normalizeStroke(stroke: Point[]): Point[] {
  if (!stroke || stroke.length === 0) return [];
  let xMin = stroke[0].x;
  let xMax = stroke[0].x;
  let yMin = stroke[0].y;
  let yMax = stroke[0].y;
  for (const p of stroke) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const w = (xMax - xMin) || 1e-6;
  const h = (yMax - yMin) || 1e-6;
  return stroke.map((p) => ({
    x: (p.x - xMin) / w,
    y: (p.y - yMin) / h,
    p: p.p ?? 0,
  }));
}
