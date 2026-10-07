# trainer

Trains the stroke classifier the app uses, compares it with a few other
architectures, and exports it to TF.js.

```
data.py          load strokes, render 96×96 images, 12 features, 64-step sequences, augmentation
models.py        geometric, image, hybrid, tcn, tcn_hybrid
train.py         train one model or all of them (entry point)
export_tfjs.py   Keras -> SavedModel -> TF.js graph model
convert_data.py  old per-label JSON files -> JSONL
notebooks/       feature analysis
```

Cloud GPU runs use the repo-root `Dockerfile` (see "GPU runs on Akash" below).

## Data

Each sample is one stroke and its label. Labels, in this order (it's the
model's output order, don't change it): `underline, box, curly, delete,
squarebracket, wavybracket, circlebracket, none`.

`data/raw_jsonl/<contributor>.jsonl`, one stroke per line:

```json
{"label":"box","stroke":[[135.0,112.3,0.7],[134.1,114.7,0.7]],"contributor":"Sang","pointer":"pen"}
```

Points are `[x, y, pressure]`. Only `label` and `stroke` are required; other
fields are ignored. The old format (`data/raw/<contributor>/<label>.json`) still
loads, and `python convert_data.py` converts it.

Right now there are 4,936 strokes from 5 people. More variety (size, speed,
slant, pen vs finger, different people) helps more than more of the same, and
`none` needs plenty of ordinary writing so the model learns to leave it alone.

## Inputs

- image: the stroke drawn at 96×96, line width 3, stretched to fill
- features: 12 numbers (closure, compactness, aspect ratio, edge fraction, …)
- sequence: 64 points resampled along the path, `[x, y, dx, dy]` (TCN models only)

The renderer and the features are the same code as the app's
`src/canvas/render/raster.ts` and `src/modifiers/features.ts`, ported to Python.
If you change one side, change the other.

Augmentation jitters the raw points (±8° rotation, 0.85–1.2× scale per axis,
about 1 px of noise), so the image and features stay consistent. The
train/validation split happens before augmentation, so copies of one stroke
never end up on both sides.

## Models

| name | input | |
|---|---|---|
| geometric | features | baseline |
| image | image | baseline (MobileNetV3-Small) |
| hybrid | image + features | what the app ships |
| tcn | sequence | candidate |
| tcn_hybrid | sequence + features | candidate |

Only `hybrid` matches what the app feeds the model (`img_input` 96×96×3 in
[0,1], `feature_input` 12 → 8-way softmax). Shipping a TCN would mean changing
`predict.ts` to send the sequence too.

## Running

```bash
cd trainer
pip install -r requirements.txt     # Python 3.10–3.12, TF 2.19, tfjs 4.22

python train.py --model hybrid --finetune      # the app model
python train.py --model all --augment 5        # everything, plus out/comparison.md
```

Defaults: `--epochs 40 --batch-size 64 --augment 4 --val-split 0.15 --quantize uint16`.
`--finetune` adds a second, low learning-rate pass with the CNN unfrozen
(image and hybrid). `--mixed-precision` uses float16 on a GPU.

Output goes to `out/`: a `.keras` file per model, `comparison.md` / `.json`
when several models ran (accuracy, macro-F1, size, CPU latency), and for the
hybrid `tfjs/` + `labels.json`.

## Putting a model in the app

Nothing is copied into the app unless you ask for it:

```bash
python train.py --model hybrid --finetune --app-tfjs-dir ../app-v2/public/tfjs
```

Reload the app and it loads the new `/tfjs/model.json`.

## GPU runs on Akash

The repo-root `Dockerfile` bakes in the code and `data/raw_jsonl`, so rebuild
and push after any change (Akash hosts are x86):

```bash
docker buildx build --platform linux/amd64 -t andyhuynh24/onepen-trainer:v2 --push .
```

In AkashTrainer's sweep page use that image, base command
`python3 trainer/train.py --no-export --epochs 15`, and sweep `--model` over the
five models. Each run pushes its metrics and best `.keras` to a
`trained-output/...` branch via `akash_train.publish_results()`. The image has
no `tensorflowjs`, so export the app model locally (above).

Why the Dockerfile looks the way it does: the nvcr base is the one that actually
sees the GPU on Akash; oneDNN off avoids a LayerNorm crash on GPU; XLA off avoids
a hang around epoch 2–3 on H100s; and the container sleeps after a successful
run because Akash restarts anything that exits.
