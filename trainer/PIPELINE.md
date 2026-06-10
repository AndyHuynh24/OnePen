# OnePen — Stroke Model Pipeline (collect → train → compare → deploy)

End-to-end guide for the gesture-recognition model: how data is collected, how
it's turned into training inputs, how the models are trained and compared, and
how the winning model ships to the browser app.

- **Task:** classify one pen/touch stroke into 8 gestures —
  `underline, box, curly, delete, squarebracket, wavybracket, circlebracket, none`.
- **Where it runs in the app:** TF.js in the browser, on every drawn stroke
  (`app-v2/src/modifiers/predict.ts`).
- **Everything lives in `trainer/`** — 6 Python files, a Dockerfile, an Akash SDL.

---

## 1. Collect data

Each sample is **one stroke** = an ordered list of `(x, y, p)` points (screen
pixels; `p` = pressure, optional) plus a class label.

### Recommended format — v2 JSONL

One self-describing record per line, points as compact `[x, y, p]` arrays. One
file per contributor so you can split without leakage:

```
data/raw_jsonl/<contributor>.jsonl
```
```json
{"label":"box","stroke":[[135.0,112.3,0.7],[134.1,114.7,0.7]],"contributor":"Sang","pointer":"pen"}
```

Required: `label`, `stroke` (≥2 points). Optional and recommended for the future:
`pointer` (`pen|touch|mouse`), `canvas` (`[w,h]`), `ts` (ms). The trainer ignores
unknown fields, so adding metadata never breaks anything.

### How to capture

- **In-app collector** (the data-flywheel page) — draw strokes, pick the label,
  it appends a JSONL line. (Collector UI is a separate, optional piece.)
- **Manual / scripted** — anything that can emit the JSON above works; the app's
  stroke objects already have `{x, y, p}`.

### Collection guidelines

- Aim for **≥300 strokes per class**, balanced; `none` should be diverse
  (letters, dots, scribbles, brackets that aren't gestures) so the model learns
  to stay quiet.
- Vary **size, speed, slant, pen vs touch, and contributor** — variety matters
  far more than raw count.
- Current corpus: ~4,900 strokes across 5 contributors (then augmented ~5×).

### Migrating the old format

The legacy format was `data/raw/<contributor>/<label>.json` →
`{"modifiers":[{"type","stroke":[{x,y,p}]}]}`. Convert losslessly (≈5× smaller):

```bash
python convert_data.py --src ../data/raw --out ../data/raw_jsonl
```

The loader reads **both** formats, so you can mix old and new.

---

## 2. From strokes to model inputs

Three representations are derived from each stroke; the renderer and features are
**1:1 ports of the app's `raster.ts` / `features.ts`**, so training inputs equal
inference inputs exactly.

| Representation | Shape | Used by |
|---|---|---|
| **Image** — 96×96 raster (white bg, black stroke, lw 3, non-uniform fill) | `(96,96,3)` in `[0,1]` | image, hybrid |
| **Geometric** — 12 hand-crafted features (closure, compactness, aspect, …) | `(12,)` | geometric, hybrid, tcn_hybrid |
| **Sequence** — arc-length-resampled points `[x, y, dx, dy]` | `(64,4)` | tcn, tcn_hybrid |

**Augmentation** (train time): each raw stroke is jittered ~5× — small rotation
(±8°), per-axis scale (0.85–1.2×), and ~1px point noise — applied to the *raw
points*, so image, features, and sequence all stay consistent.

---

## 3. Models

Trained by one harness so they're directly comparable (`trainer/models.py`):

| Model | Input | Role | Idea |
|---|---|---|---|
| `geometric` | features | **baseline** | MLP on 12 hand-crafted features |
| `image` | image | **baseline** | MobileNetV3-Small CNN on the raster |
| `hybrid` | image + features | **app model** | CNN ⊕ features — what the browser deploys |
| `tcn` | sequence | candidate | dilated temporal ConvNet on the raw stroke |
| `tcn_hybrid` | sequence + features | candidate | TCN ⊕ features (usually strongest) |

The two **baselines** isolate "what does each modality alone buy you?"; the
**candidates** are compared against the deployed `hybrid` to justify an upgrade.

---

## 4. Train

```bash
cd trainer
pip install -r requirements.txt          # Python 3.10–3.12; TF 2.19 + tfjs 4.22

# one model
python train.py --model tcn_hybrid --augment 5

# the app model, and export it to TF.js
python train.py --model hybrid --finetune

# full sweep → out/comparison.md
python train.py --model all --augment 5 --finetune
```

Key flags: `--epochs 40 --batch-size 64 --augment 5 --val-split 0.15`,
`--finetune` (unfreeze the CNN for a 2nd low-LR pass, image/hybrid only),
`--mixed-precision` (float16 on GPU), `--quantize uint16` (tfjs export).

**Outputs** (`out/`): `<model>.keras` each model, `comparison.md`/`.json`
(sweep), `tfjs/` + `labels.json` (the app model). GPU is used automatically when
present.

---

## 5. Compare (the resume report)

`--model all` writes `out/comparison.md` — a table of **val accuracy, macro-F1,
params, size, and per-sample CPU latency** per model, ranked. Use it to argue:

- geometric vs image → which modality carries the signal,
- hybrid vs each baseline → the lift from fusing them,
- tcn / tcn_hybrid vs hybrid → whether the sequence model is worth deploying.

`comparison.json` has the same data for plots.

---

## 6. Deploy to the app

The **hybrid** exports to the exact TF.js contract the app already loads —
inputs `img_input (96,96,3)` + `feature_input (12)`, output `output_0` (8-way
softmax), graph-model:

```bash
# write the tfjs model AND copy it into the app (explicit — never automatic)
python train.py --model hybrid --finetune --app-tfjs-dir ../app-v2/public/tfjs
```

> The `tcn` / `tcn_hybrid` models use a different input (the sequence), so
> deploying one of those would also need `predict.ts` to feed the resampled
> sequence. The image/feature contract is unchanged for `hybrid`.

Reload the app — `tf.loadGraphModel('/tfjs/model.json')` picks up the new model.

---

## 7. Run the sweep on cloud GPU (AkashTrainer)

Training runs through **AkashTrainer** (no separate Akash config in this repo).
Paste this repo's URL; AkashTrainer builds the repo-root `Dockerfile` and runs
the sweep. `trainer/train.py` calls `akash_train.publish_results()`, so each run
publishes to the sweep leaderboard.

In AkashTrainer's **/sweep** wizard:

- **Repo URL:** this GitHub repo
- **Base command:** `python3 trainer/train.py --no-export`
- **Search space:** param `--model` ∈ `geometric, image, hybrid, tcn, tcn_hybrid`
  (optionally add `--epochs`, `--augment`, `--finetune`)
- **Strategy:** Grid / Manual → one GPU lease per model, all on one leaderboard

Each lease trains one model and pushes its metrics + best `.keras` to a
`trained-output/…` branch. The v2 dataset is baked into the image — no upload.

Local GPU equivalent (same root image):

```bash
docker build -t onepen-trainer .
docker run --gpus all -v "$PWD/out:/output" \
  -e TRAIN_CMD="python3 trainer/train.py --model all --no-export --data-dir data/raw_jsonl --out-dir /output" \
  onepen-trainer
```

> The browser TF.js model is exported **locally** (the CUDA image skips it via
> `--no-export`); see §6.
