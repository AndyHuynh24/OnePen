"""
Train one model — or sweep them all and emit a comparison report.

    python train.py --model hybrid --finetune       # train + export the app model
    python train.py --model tcn                      # train the headline model
    python train.py --model all --augment 5          # sweep: every model + report

Outputs (under --out-dir, default ./out):
    <model>.keras            each trained model
    tfjs/                    TF.js graph-model for the app model (hybrid)  <- app loads this
    labels.json              class order + metadata
    comparison.md / .json    side-by-side metrics (written in sweep mode)

GPU is used automatically when present; pass --mixed-precision to speed it up.
No experiment trackers — just flags and good defaults.
"""

from __future__ import annotations

import os

# Must be set BEFORE TensorFlow is imported. The NVIDIA CUDA TF container enables
# oneDNN custom ops, which fuse LayerNorm into a CPU-only `_MklLayerNorm` kernel
# and then crash on GPU ("No registered '_MklLayerNorm' OpKernel for GPU"). Off =
# LayerNorm uses the standard op (has a GPU kernel). Harmless on CPU.
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np


def parse_args() -> argparse.Namespace:
    here = Path(__file__).resolve().parent
    default_data = here.parent / "data" / "raw_jsonl"
    if not default_data.exists():
        default_data = here.parent / "data" / "raw"
    ap = argparse.ArgumentParser(description="Train / sweep the OnePen stroke models")
    ap.add_argument("--model", default="hybrid",
                    choices=["geometric", "image", "hybrid", "tcn", "tcn_hybrid", "all"])
    ap.add_argument("--data-dir", default=str(default_data), help="raw stroke data (v1 json or v2 jsonl)")
    ap.add_argument("--out-dir", default=str(here / "out"))
    ap.add_argument("--app-tfjs-dir", default="",
                    help="deploy: copy the app model's tfjs here, e.g. ../app-v2/public/tfjs "
                         "(empty = don't touch the live app model)")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--augment", type=int, default=4)
    ap.add_argument("--val-split", type=float, default=0.15)
    ap.add_argument("--finetune", action="store_true", help="unfreeze CNN backbone for a 2nd pass (image/hybrid)")
    ap.add_argument("--mixed-precision", action="store_true", help="float16 compute on GPU")
    ap.add_argument("--quantize", choices=["none", "uint8", "uint16"], default="uint16")
    ap.add_argument("--no-export", action="store_true", help="skip the TF.js export of the app model")
    ap.add_argument("--seed", type=int, default=42)
    return ap.parse_args()


def setup_gpu(mixed_precision: bool):
    import tensorflow as tf

    gpus = tf.config.list_physical_devices("GPU")
    for g in gpus:
        try:
            tf.config.experimental.set_memory_growth(g, True)
        except RuntimeError:
            pass
    if mixed_precision and gpus:
        tf.keras.mixed_precision.set_global_policy("mixed_float16")
        print("[gpu] mixed_float16 enabled")
    print(f"[gpu] TF {tf.__version__} | GPUs: {[g.name for g in gpus] or 'none (CPU)'}")
    return gpus


def train_one(name, ds, tr, va, class_weight, args, log=print):
    import tensorflow as tf
    from sklearn.metrics import f1_score

    from models import MODELS, APP_MODEL

    builder, supports_finetune = MODELS[name]
    model, input_keys = builder(lr=2e-4 if "image" in name or name == "hybrid" else 1e-3)
    pool = {"img_input": ds.images, "feature_input": ds.features, "seq_input": ds.sequences}

    def inputs(sel):
        x = {k: pool[k][sel] for k in input_keys}
        return x if len(x) > 1 else x[input_keys[0]]

    y_tr, y_va = ds.labels[tr], ds.labels[va]
    val_data = (inputs(va), y_va)
    ckpt = Path(args.out_dir) / f"{name}.keras"
    cbs = [
        tf.keras.callbacks.ModelCheckpoint(str(ckpt), monitor="val_accuracy", save_best_only=True, mode="max"),
        tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=8, restore_best_weights=True, mode="max"),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=4, min_lr=1e-6),
    ]

    log(f"[{name}] params={model.count_params():,} inputs={input_keys}")
    t0 = time.time()
    h1 = model.fit(inputs(tr), y_tr, validation_data=val_data, epochs=args.epochs,
                   batch_size=args.batch_size, class_weight=class_weight, callbacks=cbs, verbose=2)
    curves = {k: [float(x) for x in v] for k, v in h1.history.items()}

    if args.finetune and supports_finetune:
        log(f"[{name}] fine-tuning backbone @ lr/10")
        model.trainable = True
        model.compile(optimizer=tf.keras.optimizers.Adam(2e-5),
                      loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        h2 = model.fit(inputs(tr), y_tr, validation_data=val_data, epochs=max(8, args.epochs // 2),
                       batch_size=args.batch_size, class_weight=class_weight, callbacks=cbs, verbose=2)
        for k, v in h2.history.items():
            curves.setdefault(k, []).extend(float(x) for x in v)
    train_s = time.time() - t0

    # metrics
    probs = model.predict(inputs(va), batch_size=256, verbose=0)
    pred = probs.argmax(1)
    acc = float((pred == y_va).mean())
    macro_f1 = float(f1_score(y_va, pred, average="macro"))

    # single-sample forward-pass latency (median; direct call avoids predict() overhead)
    one = {k: tf.convert_to_tensor(pool[k][va][:1]) for k in input_keys}
    one = one if len(one) > 1 else one[input_keys[0]]
    for _ in range(5):
        model(one, training=False)  # warm
    times = []
    for _ in range(50):
        s = time.perf_counter()
        model(one, training=False)
        times.append((time.perf_counter() - s) * 1000)
    latency_ms = float(np.median(times))

    model.save(str(ckpt))
    size_mb = round(ckpt.stat().st_size / 1e6, 2)
    log(f"[{name}] val_acc={acc:.4f} macro_f1={macro_f1:.4f} "
        f"params={model.count_params():,} size={size_mb}MB lat={latency_ms:.1f}ms")

    return {
        "model": name,
        "role": "app" if name == APP_MODEL else ("baseline" if name in ("geometric", "image") else "candidate"),
        "inputs": "+".join(input_keys),
        "params": int(model.count_params()),
        "size_mb": size_mb,
        "val_accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "cpu_ms_per_sample": round(latency_ms, 2),
        "train_seconds": round(train_s, 1),
    }, ckpt, input_keys, curves


def publish_to_akashtrainer(results, ckpts, curves, args, log=print):
    """Publish the run's best result to AkashTrainer's leaderboard. No-ops locally
    (publish_results skips the git push when REPO_URL / GITHUB_TOKEN are unset)."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root
        from akash_train import publish_results
    except Exception as e:
        log(f"[akash] publish helper unavailable ({e}) — skipping")
        return
    best = max(results, key=lambda r: r["val_accuracy"])
    name = best["model"]
    c = curves.get(name, {})
    res = publish_results(
        success=True,
        output_dir=args.out_dir,
        metrics={
            "val_accuracy": best["val_accuracy"],
            "macro_f1": best["macro_f1"],
            "params": best["params"],
            "size_mb": best["size_mb"],
            "cpu_ms_per_sample": best["cpu_ms_per_sample"],
            "val_acc_curve": c.get("val_accuracy", []),
            "val_loss_curve": c.get("val_loss", []),
            "train_acc_curve": c.get("accuracy", []),
            "train_loss_curve": c.get("loss", []),
        },
        model_path=str(ckpts.get(name)) if ckpts.get(name) else None,
        hyperparams={
            "model": name, "epochs": args.epochs, "augment": args.augment,
            "batch_size": args.batch_size, "finetune": args.finetune,
        },
        extra_files=[str(Path(args.out_dir) / "comparison.md")] if len(results) > 1 else None,
    )
    log(f"[akash] {res}")


def write_comparison(results, out_dir, log=print):
    results = sorted(results, key=lambda r: r["val_accuracy"], reverse=True)
    (Path(out_dir) / "comparison.json").write_text(json.dumps(results, indent=2))
    cols = ["model", "role", "inputs", "params", "size_mb", "val_accuracy", "macro_f1", "cpu_ms_per_sample"]
    head = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join("---" for _ in cols) + " |"
    rows = ["| " + " | ".join(f"{r[c]:,}" if c == "params" else str(r[c]) for c in cols) + " |" for r in results]
    md = "# Model comparison\n\n" + "\n".join([head, sep, *rows]) + "\n\n" \
         "_Baselines: `geometric`, `image`. App model: `hybrid`. Candidates: `tcn`, `tcn_hybrid`._\n"
    (Path(out_dir) / "comparison.md").write_text(md)
    log("\n" + md)


def main() -> int:
    args = parse_args()
    setup_gpu(args.mixed_precision)

    import tensorflow as tf
    from sklearn.model_selection import train_test_split
    from sklearn.utils.class_weight import compute_class_weight

    from data import CLASSES, FEATURE_DIM, IMG_SIZE, SEQ_CHANNELS, SEQ_LEN, build_dataset
    from models import MODELS, APP_MODEL
    from export_tfjs import convert

    tf.random.set_seed(args.seed)
    np.random.seed(args.seed)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    ds = build_dataset(args.data_dir, augment=args.augment, seed=args.seed)
    idx = np.arange(len(ds.labels))
    tr, va = train_test_split(idx, test_size=args.val_split, random_state=args.seed, stratify=ds.labels)
    weights = compute_class_weight("balanced", classes=np.arange(len(CLASSES)), y=ds.labels[tr])
    class_weight = {i: float(w) for i, w in enumerate(weights)}
    print(f"[data] train={len(tr)} val={len(va)}")

    targets = list(MODELS) if args.model == "all" else [args.model]
    results, ckpts, curves_by, app_ckpt, app_keys = [], {}, {}, None, None
    for name in targets:
        res, ckpt, keys, curves = train_one(name, ds, tr, va, class_weight, args)
        results.append(res)
        ckpts[name] = ckpt
        curves_by[name] = curves
        if name == APP_MODEL:
            app_ckpt, app_keys = ckpt, keys

    if len(results) > 1:
        write_comparison(results, out)

    # export the app model (hybrid) to the browser contract
    if app_ckpt and not args.no_export:
        tfjs_dir = out / "tfjs"
        convert(app_ckpt, tfjs_dir, quantize=args.quantize)
        (out / "labels.json").write_text(json.dumps({
            "classes": CLASSES, "img_size": IMG_SIZE, "feature_dim": FEATURE_DIM,
            "seq_len": SEQ_LEN, "seq_channels": SEQ_CHANNELS,
            "app_model": APP_MODEL, "inputs": app_keys,
        }, indent=2))
        if args.app_tfjs_dir and Path(args.app_tfjs_dir).parent.exists():
            dst = Path(args.app_tfjs_dir)
            dst.mkdir(parents=True, exist_ok=True)
            for f in tfjs_dir.iterdir():
                shutil.copy2(f, dst / f.name)
            print(f"[export] copied app tfjs model -> {dst}")

    # AkashTrainer: publish this run's result to the sweep leaderboard
    publish_to_akashtrainer(results, ckpts, curves_by, args)

    print(f"[done] -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
