# OnePen — stroke classifier trainer

Compact, self-contained pipeline that trains the gesture model the app uses,
compares it against baselines + candidate architectures, and exports the winner
as a TensorFlow.js graph-model. No experiment trackers, no config files.

> Full walkthrough (data collection → deploy): **[PIPELINE.md](PIPELINE.md)**.

```
trainer/
  data.py          raw strokes → 96×96 image + 12-D features + (64×4) sequence
  models.py        geometric · image · hybrid · tcn · tcn_hybrid
  train.py         train one model — or sweep all + comparison report   (entry point)
  export_tfjs.py   Keras → SavedModel → TF.js graph-model
  convert_data.py  legacy JSON → compact v2 JSONL
  requirements.txt / Dockerfile / akash-deploy.yaml
```

## Models

| name | input | role |
|---|---|---|
| `geometric` | 12 features | baseline |
| `image` | 96×96 raster | baseline |
| `hybrid` | image + features | **app model** (what the browser deploys) |
| `tcn` | stroke sequence | candidate |
| `tcn_hybrid` | sequence + features | candidate (usually strongest) |

## What the app model produces

The **hybrid** exports a drop-in replacement for `app-v2/public/tfjs/model.json`,
with a fixed contract so the browser loads it unchanged:

| | |
|---|---|
| inputs | `img_input` `(96,96,3)` in **[0,1]**, `feature_input` `(12,)` raw |
| output | 8-way softmax: `underline, box, curly, delete, squarebracket, wavybracket, circlebracket, none` |
| format | TF.js **graph-model** (`tf.loadGraphModel`) |

The 96×96 rasterizer and the 12 features are 1:1 ports of the app's
`canvas/render/raster.ts` and `modifiers/features.ts`, so training inputs match
inference inputs exactly.

## Data

Two formats are read (mix freely); label must be one of the 8 classes.

**v2 — JSONL (recommended, default).** One record per line in
`data/raw_jsonl/<contributor>.jsonl`, points as `[x,y,p]` arrays (~5× smaller):

```json
{"label":"box","stroke":[[135.0,112.3,0.7],[134.1,114.7,0.7]],"contributor":"Sang","pointer":"pen"}
```

**v1 — legacy nested JSON** (`data/raw/<contributor>/*.json`) still loads. Migrate:

```bash
python convert_data.py --src ../data/raw --out ../data/raw_jsonl
```

## Run locally

```bash
cd trainer
pip install -r requirements.txt          # Python 3.10–3.12; TF 2.19 + tfjs 4.22

python train.py --model hybrid --finetune        # train + tfjs-export the app model
python train.py --model all --augment 5 --finetune   # sweep → out/comparison.md
```

Outputs in `out/`: `<model>.keras`, `comparison.md`/`.json` (sweep), and for the
app model `tfjs/` + `labels.json`. GPU is used automatically; add
`--mixed-precision` to speed it up. Other flags: `--epochs 40 --batch-size 64
--augment 5 --quantize uint16`.

**Deploying to the app is explicit** (so a dev run never clobbers the live model):

```bash
python train.py --model hybrid --finetune --app-tfjs-dir ../app-v2/public/tfjs
```

## Run the sweep on cloud GPU (AkashTrainer)

Training runs through **AkashTrainer** — paste this repo's URL, it builds the
repo-root `Dockerfile` and runs the sweep. `trainer/train.py` calls
`akash_train.publish_results()`, so every run lands on the sweep leaderboard
(scalars = sortable columns, curves = charts, hyperparams = parallel-coords).

In AkashTrainer's **/sweep** wizard:

| field | value |
|---|---|
| Repo URL | this GitHub repo |
| Base command | `python3 trainer/train.py --no-export` |
| Search space | param `--model` ∈ `geometric, image, hybrid, tcn, tcn_hybrid` |
| Strategy | Grid or Manual → one GPU lease per model, all compared on the leaderboard |

Each lease trains one model and pushes its metrics + best `.keras` to a
`trained-output/…` branch. The v2 dataset is baked into the image — no upload.

**Local GPU** (same root image):

```bash
docker build -t onepen-trainer .          # build from repo root
docker run --gpus all -v "$PWD/out:/output" \
  -e TRAIN_CMD="python3 trainer/train.py --model all --no-export --data-dir data/raw_jsonl --out-dir /output" \
  onepen-trainer
```

> The browser (`hybrid`) TF.js model is exported **locally**, not on the cloud
> image (`--no-export` — `tensorflowjs` isn't in the CUDA base). Deploy it with
> `python train.py --model hybrid --finetune --app-tfjs-dir ../app-v2/public/tfjs`.
