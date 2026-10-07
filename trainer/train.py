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
# FORCE these (not setdefault) — the nvcr container pre-sets both, so setdefault
# would be a no-op and the fixes wouldn't take. Must run before TensorFlow imports.
#  - oneDNN off: LayerNorm -> CPU-only _MklLayerNorm kernel crashes on GPU.
#  - XLA auto-JIT off: on H100 + this TF build XLA emits PTX the driver only
#    half-recognizes ('+ptx85') and then DEADLOCKS around epoch 3. NOTE: this env
#    flag alone is NOT enough — Keras 3 (TF 2.16+/nvcr) defaults jit_compile="auto"
#    and turns XLA on per-model regardless. The real guard is jit_compile=False in
#    models._compile() + tf.config.optimizer.set_jit(False); this flag just kills
#    the graph-mode auto-clustering path. Models are tiny, so XLA buys nothing.
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["TF_XLA_FLAGS"] = "--tf_xla_auto_jit=0"

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

    # Hard-disable XLA JIT at the graph level too (the env flag + per-model
    # jit_compile=False are the primary guards; this covers any auto-clustering
    # path). XLA on this H100/TF build deadlocks ~epoch 3 with '+ptx85' PTX.
    try:
        tf.config.optimizer.set_jit(False)
    except Exception:
        pass

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


def ensure_gpu_or_warn(gpus):
    """No GPU visible? Do NOT hard-exit. On Akash/Kubernetes a non-zero exit just
    CrashLoopBackOffs the pod on the SAME node — it does not redeploy elsewhere — so
    fail-fast turns a flaky provider into an infinite restart loop. Instead: wait a
    bit (the GPU device plugin can attach a few seconds after the container starts),
    then if it's still missing, warn loudly and continue. A slow CPU run that finishes
    and publishes beats a crash loop; close the run and pick another provider."""
    if gpus:
        return gpus
    import tensorflow as tf
    for _ in range(12):  # ~60s, for a device-plugin race
        time.sleep(5)
        gpus = tf.config.list_physical_devices("GPU")
        if gpus:
            for g in gpus:
                try:
                    tf.config.experimental.set_memory_growth(g, True)
                except RuntimeError:
                    pass
            print(f"[gpu] GPU attached after wait: {[g.name for g in gpus]}", flush=True)
            return gpus
    print("=" * 72, flush=True)
    print("[warn] No CUDA GPU visible after 60s — training on CPU (very slow). If "
          "this is a GPU lease, the provider didn't expose the GPU; close this run "
          "and redeploy on another provider.", flush=True)
    print("=" * 72, flush=True)
    return gpus


def train_one(name, train_set, val_set, class_weight, args, log=print):
    import tensorflow as tf
    from sklearn.metrics import f1_score

    from models import MODELS, APP_MODEL

    builder, supports_finetune = MODELS[name]
    model, input_keys = builder(lr=2e-4 if "image" in name or name == "hybrid" else 1e-3)
    ATTR = {"img_input": "images", "feature_input": "features", "seq_input": "sequences"}

    # Memory-safe input pipeline: images are stored uint8 and normalized to [0,1]
    # PER BATCH via tf.data, so the full float32 image array is never materialized
    # — that's what keeps the image/hybrid models inside a Medium tier's RAM. Keras
    # matches dict keys to Input-layer names, so a dict works for single- and
    # multi-input models alike.
    def make_ds(dset, shuffle):
        feats = {k: getattr(dset, ATTR[k]) for k in input_keys}
        d = tf.data.Dataset.from_tensor_slices((feats, dset.labels))
        if "img_input" in input_keys:
            d = d.map(lambda x, y: ({**x, "img_input": tf.cast(x["img_input"], tf.float32) / 255.0}, y),
                      num_parallel_calls=tf.data.AUTOTUNE)
        if shuffle:
            d = d.shuffle(min(len(dset.labels), 8192), seed=args.seed, reshuffle_each_iteration=True)
        # drop the partial last batch in training so every step has the same shape
        # (uniform shape => no graph re-tracing each epoch). Keep all val samples.
        return d.batch(args.batch_size, drop_remainder=shuffle).prefetch(tf.data.AUTOTUNE)

    y_va = val_set.labels
    train_ds, val_ds = make_ds(train_set, True), make_ds(val_set, False)
    ckpt = Path(args.out_dir) / f"{name}.keras"
    cbs = [
        tf.keras.callbacks.ModelCheckpoint(str(ckpt), monitor="val_accuracy", save_best_only=True, mode="max"),
        tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=8, restore_best_weights=True, mode="max"),
        tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=4, min_lr=1e-6),
    ]

    log(f"[{name}] params={model.count_params():,} inputs={input_keys}")
    t0 = time.time()
    h1 = model.fit(train_ds, validation_data=val_ds, epochs=args.epochs,
                   class_weight=class_weight, callbacks=cbs, verbose=2)
    curves = {k: [float(x) for x in v] for k, v in h1.history.items()}

    if args.finetune and supports_finetune:
        log(f"[{name}] fine-tuning backbone @ lr/10")
        model.trainable = True
        model.compile(optimizer=tf.keras.optimizers.Adam(2e-5),
                      loss="sparse_categorical_crossentropy", metrics=["accuracy"],
                      jit_compile=False)  # keep XLA off on the 2nd pass too (see models._compile)
        h2 = model.fit(train_ds, validation_data=val_ds, epochs=max(8, args.epochs // 2),
                       class_weight=class_weight, callbacks=cbs, verbose=2)
        for k, v in h2.history.items():
            curves.setdefault(k, []).extend(float(x) for x in v)
    train_s = time.time() - t0

    # metrics (val_ds is unshuffled, so predictions line up with y_va)
    probs = model.predict(val_ds, verbose=0)
    pred = probs.argmax(1)
    acc = float((pred == y_va).mean())
    macro_f1 = float(f1_score(y_va, pred, average="macro"))

    # single-sample forward-pass latency (median; direct call avoids predict() overhead)
    one = {k: (tf.cast(getattr(val_set, ATTR[k])[:1], tf.float32) / 255.0 if k == "img_input"
               else tf.convert_to_tensor(getattr(val_set, ATTR[k])[:1])) for k in input_keys}
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
        hyperparams={**vars(args), "model": name},
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
    gpus = setup_gpu(args.mixed_precision)
    gpus = ensure_gpu_or_warn(gpus)  # wait for a late GPU, then warn (never crash-loop)

    import tensorflow as tf
    from sklearn.model_selection import train_test_split
    from sklearn.utils.class_weight import compute_class_weight

    from data import CLASSES, FEATURE_DIM, IMG_SIZE, SEQ_CHANNELS, SEQ_LEN, load_raw, build_arrays
    from models import MODELS, APP_MODEL
    from export_tfjs import convert

    tf.random.set_seed(args.seed)
    np.random.seed(args.seed)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Split on the BASE strokes (before augmentation) so augmented copies of a
    # stroke never straddle train/val — no leakage, honest val metrics.
    raw = load_raw(args.data_dir)
    labels = np.asarray([lbl for lbl, _ in raw], dtype=np.int32)
    base = np.arange(len(raw))
    tr, va = train_test_split(base, test_size=args.val_split, random_state=args.seed, stratify=labels)
    train_set = build_arrays([raw[i] for i in tr], augment=args.augment, seed=args.seed)  # augmented
    val_set = build_arrays([raw[i] for i in va], augment=0, seed=args.seed)                # clean
    weights = compute_class_weight("balanced", classes=np.arange(len(CLASSES)), y=train_set.labels)
    class_weight = {i: float(w) for i, w in enumerate(weights)}
    print(f"[data] {len(raw)} base strokes -> train {len(tr)} (x{args.augment} aug = "
          f"{len(train_set.labels)}) / val {len(va)} (clean)")

    targets = list(MODELS) if args.model == "all" else [args.model]
    results, ckpts, curves_by, app_ckpt, app_keys = [], {}, {}, None, None
    for name in targets:
        res, ckpt, keys, curves = train_one(name, train_set, val_set, class_weight, args)
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
