"""
Data pipeline for the OnePen stroke classifier.

Loads raw stroke JSON, renders each stroke to a 96x96 image and computes a
12-D geometric feature vector, then (optionally) augments by jittering the raw
stroke points. The renderer and feature formulas are 1:1 ports of the app's
`raster.ts` and `features.ts`, so what the model trains on matches exactly what
the browser feeds at inference.

Raw format (per file): {"modifiers": [{"type": <class>, "stroke": [{"x","y","p"}, ...]}, ...]}
The class label is taken from each modifier's "type" field.
"""

from __future__ import annotations

import glob
import json
import math
import os
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw

# Class order MUST match app-v2/src/config/strokeTypes.ts CLASSES[0:8] and the
# deployed model's softmax order. Do not reorder.
CLASSES: list[str] = [
    "underline",
    "box",
    "curly",
    "delete",
    "squarebracket",
    "wavybracket",
    "circlebracket",
    "none",
]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}

IMG_SIZE = 96
LINE_WIDTH = 3
FEATURE_DIM = 12

# Raw-stroke sequence representation (for the TCN). Each stroke is resampled to a
# fixed length by arc length; per-step channels are [x, y, dx, dy] (normalized).
SEQ_LEN = 64
SEQ_CHANNELS = 4


# ─────────────────────────────────────────────────────────────────────────────
# Feature vector — 1:1 port of computeStrokeFeatures() in features.ts
# ─────────────────────────────────────────────────────────────────────────────
def compute_features(
    stroke: list[dict], height_threshold: float = 45.0, cap_value: float = 100.0
) -> list[float]:
    pts = [(float(p["x"]), float(p["y"])) for p in stroke
           if math.isfinite(p.get("x", math.nan)) and math.isfinite(p.get("y", math.nan))]
    n = len(pts)
    if n < 2:
        return [0.0] * FEATURE_DIM

    xs = np.array([p[0] for p in pts], dtype=np.float64)
    ys = np.array([p[1] for p in pts], dtype=np.float64)

    x_min, x_max = float(xs.min()), float(xs.max())
    y_min, y_max = float(ys.min()), float(ys.max())
    w = max(x_max - x_min, 1e-6)
    h = max(y_max - y_min, 1e-6)
    diag = math.sqrt(w * w + h * h)

    seg = np.hypot(np.diff(xs), np.diff(ys))
    total_len = float(seg.sum())

    # 0 — closure ratio
    end_to_start = math.hypot(xs[-1] - xs[0], ys[-1] - ys[0])
    closure_ratio = 1.0 - min(end_to_start / (diag + 1e-6), 1.0)

    # 1 — compactness
    compactness = total_len / (diag + 1e-6)

    # 2 — spread ratio
    cx, cy = float(xs.mean()), float(ys.mean())
    d = np.hypot(xs - cx, ys - cy)
    spread_mean = float(d.mean())
    spread_std = math.sqrt(max(float((d * d).mean()) - spread_mean * spread_mean, 0.0))
    spread_ratio = spread_std / (diag + 1e-6)

    # 3 — aspect ratio
    aspect_ratio = (2.0 * math.atan(w / h)) / math.pi

    # 4 — edge fraction
    xn = (xs - x_min) / w
    yn = (ys - y_min) / h
    d_edge = np.minimum.reduce([xn, 1.0 - xn, yn, 1.0 - yn])
    edge_frac = float((d_edge < 0.1).sum()) / n

    # 5 — number of points
    num_points = float(n)

    # 6 — height difference (clamped)
    height_diff = max(-1.0, min(1.0, (h - height_threshold) / cap_value))

    # 7 — horizontal variance (population std of x)
    horiz_var = float(xs.std())

    # 8 — total length (reused)

    # 9 — perimeter to diagonal ratio
    perim_diag_ratio = (2.0 * (w + h)) / (diag + 1e-6)

    # 10 — spine verticality
    spine_angle = abs(math.atan2(ys[-1] - ys[0], xs[-1] - xs[0]))
    spine_verticality = 1.0 - abs(spine_angle - math.pi / 2) / (math.pi / 2)

    # 11 — vertical variance (population std of y)
    vert_var = float(ys.std())

    return [
        closure_ratio,
        compactness,
        spread_ratio,
        aspect_ratio,
        edge_frac,
        num_points,
        height_diff,
        horiz_var,
        total_len,
        perim_diag_ratio,
        spine_verticality,
        vert_var,
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Renderer — emulates raster.ts (96px, line width 3, margin 3, non-uniform scale
# to fill, white bg / black stroke, quadratic-midpoint smoothing, round caps).
# A round brush is stamped along the densely-sampled smoothed path, which matches
# the canvas round-stroke output closely.
# ─────────────────────────────────────────────────────────────────────────────
def render_stroke(stroke: list[dict], img_size: int = IMG_SIZE, line_width: int = LINE_WIDTH) -> np.ndarray:
    margin = line_width
    pts = [(float(p["x"]), float(p["y"])) for p in stroke
           if math.isfinite(p.get("x", math.nan)) and math.isfinite(p.get("y", math.nan))]

    img = Image.new("RGB", (img_size, img_size), "white")
    if len(pts) == 0:
        return np.asarray(img, dtype=np.float32) / 255.0

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    scale_x = (img_size - margin * 2) / (max_x - min_x + 1e-5)
    scale_y = (img_size - margin * 2) / (max_y - min_y + 1e-5)
    sp = [((x - min_x) * scale_x + margin, (y - min_y) * scale_y + margin) for x, y in pts]

    # Build the smoothed polyline the same way the canvas does.
    path: list[tuple[float, float]] = []
    if len(sp) < 3:
        path = sp[:]
    else:
        path.append(sp[0])
        for i in range(1, len(sp) - 1):
            xc = (sp[i][0] + sp[i + 1][0]) / 2
            yc = (sp[i][1] + sp[i + 1][1]) / 2
            # quadratic from last path point, control = sp[i], end = midpoint
            path.extend(_sample_quadratic(path[-1], sp[i], (xc, yc)))
        path.append(sp[-1])

    draw = ImageDraw.Draw(img)
    r = line_width / 2.0
    for x, y in path:
        draw.ellipse((x - r, y - r, x + r, y + r), fill="black")
    return np.asarray(img, dtype=np.float32) / 255.0


def _sample_quadratic(p0, pc, p1, steps: int = 6) -> list[tuple[float, float]]:
    out = []
    for s in range(1, steps + 1):
        t = s / steps
        mt = 1.0 - t
        a, b, c = mt * mt, 2 * mt * t, t * t
        out.append((a * p0[0] + b * pc[0] + c * p1[0], a * p0[1] + b * pc[1] + c * p1[1]))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Augmentation — jitter the RAW stroke points (rotation + per-axis scale + point
# noise) before rendering/featurizing, so image and features stay consistent.
# ─────────────────────────────────────────────────────────────────────────────
def augment_stroke(stroke: list[dict], rng: np.random.Generator) -> list[dict]:
    pts = np.array([[float(p["x"]), float(p["y"])] for p in stroke], dtype=np.float64)
    c = pts.mean(axis=0)
    ang = math.radians(rng.uniform(-8.0, 8.0))
    ca, sa = math.cos(ang), math.sin(ang)
    sx, sy = rng.uniform(0.85, 1.2), rng.uniform(0.85, 1.2)
    rot = np.array([[ca, -sa], [sa, ca]])
    scl = np.array([[sx, 0.0], [0.0, sy]])
    out = (pts - c) @ rot.T @ scl.T + c
    out += rng.normal(0.0, 1.2, size=out.shape)  # ~1px point jitter
    return [{"x": float(x), "y": float(y)} for x, y in out]


# ─────────────────────────────────────────────────────────────────────────────
# Sequence representation (for the TCN). Aspect-preserving normalization, then
# arc-length resampling to a fixed length; channels = [x, y, dx, dy].
# ─────────────────────────────────────────────────────────────────────────────
def resample_sequence(stroke: list[dict], seq_len: int = SEQ_LEN) -> np.ndarray:
    pts = np.array([[float(p["x"]), float(p["y"])] for p in stroke
                    if math.isfinite(p.get("x", math.nan)) and math.isfinite(p.get("y", math.nan))],
                   dtype=np.float64)
    if len(pts) < 2:
        return np.zeros((seq_len, SEQ_CHANNELS), dtype=np.float32)

    # aspect-preserving normalize into a centered unit box
    mn = pts.min(axis=0)
    span = max(float((pts.max(axis=0) - mn).max()), 1e-6)
    pts = (pts - mn) / span - 0.5

    # cumulative arc length, then sample seq_len equally spaced points
    seg = np.hypot(*np.diff(pts, axis=0).T)
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    total = arc[-1] if arc[-1] > 1e-9 else 1.0
    targets = np.linspace(0.0, total, seq_len)
    rx = np.interp(targets, arc, pts[:, 0])
    ry = np.interp(targets, arc, pts[:, 1])
    res = np.stack([rx, ry], axis=1)

    deltas = np.diff(res, axis=0, prepend=res[:1])
    return np.concatenate([res, deltas], axis=1).astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# Loading + building arrays
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Dataset:
    images: np.ndarray     # (N, 96, 96, 3) float32 in [0,1]
    features: np.ndarray   # (N, 12) float32
    sequences: np.ndarray  # (N, SEQ_LEN, SEQ_CHANNELS) float32
    labels: np.ndarray     # (N,) int32


def _norm_points(stroke) -> list[dict]:
    """Accept points as {"x","y","p"} dicts OR compact [x, y, p] arrays and
    return the dict form the renderer/feature code expects."""
    out = []
    for p in stroke:
        if isinstance(p, dict):
            out.append({"x": p.get("x"), "y": p.get("y")})
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            out.append({"x": p[0], "y": p[1]})
    return out


def _iter_raw_samples(raw_dir: str):
    """Yield (label, points) from both supported formats:

      v1 (.json):  {"modifiers": [{"type": <label>, "stroke": [{x,y,p}, ...]}]}
      v2 (.jsonl): one record per line  {"label": <label>, "stroke": [[x,y,p], ...]}
    """
    patterns = ["**/*.json", "**/*.jsonl"]
    paths = sorted({p for pat in patterns for p in glob.glob(os.path.join(raw_dir, pat), recursive=True)})
    for path in paths:
        if path.endswith(".jsonl"):
            for line in _read_lines(path):
                rec = _parse_json(line)
                if not isinstance(rec, dict):
                    continue
                label = rec.get("label") or rec.get("type")
                pts = _norm_points(rec.get("stroke", []))
                if label in CLASS_TO_IDX and len(pts) >= 2:
                    yield label, pts
        else:
            data = _parse_json(_read_text(path))
            if data is None:
                continue
            mods = data.get("modifiers", []) if isinstance(data, dict) else data
            for m in mods:
                if not isinstance(m, dict):
                    continue
                label = m.get("type") or m.get("label")
                pts = _norm_points(m.get("stroke", []))
                if label in CLASS_TO_IDX and len(pts) >= 2:
                    yield label, pts


def _read_text(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _read_lines(path: str):
    try:
        with open(path, encoding="utf-8") as f:
            yield from f
    except OSError:
        return


def _parse_json(text: str):
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None


def build_dataset(raw_dir: str, augment: int = 4, seed: int = 42, log=print) -> Dataset:
    """Load raw strokes → (images, features, labels). `augment` extra copies per
    sample (0 = originals only)."""
    rng = np.random.default_rng(seed)
    raw = list(_iter_raw_samples(raw_dir))
    log(f"[data] {len(raw)} raw strokes from {raw_dir}")
    if not raw:
        raise SystemExit(f"No usable strokes found under {raw_dir}")

    images, features, sequences, labels = [], [], [], []

    def add(stroke, idx):
        images.append(render_stroke(stroke))
        features.append(compute_features(stroke))
        sequences.append(resample_sequence(stroke))
        labels.append(idx)

    for label, stroke in raw:
        idx = CLASS_TO_IDX[label]
        add(stroke, idx)
        for _ in range(augment):
            add(augment_stroke(stroke, rng), idx)

    ds = Dataset(
        images=np.asarray(images, dtype=np.float32),
        features=np.asarray(features, dtype=np.float32),
        sequences=np.asarray(sequences, dtype=np.float32),
        labels=np.asarray(labels, dtype=np.int32),
    )
    counts = {CLASSES[i]: int((ds.labels == i).sum()) for i in range(len(CLASSES))}
    log(f"[data] built {len(ds.labels)} samples (augment x{augment}) — {counts}")
    return ds
