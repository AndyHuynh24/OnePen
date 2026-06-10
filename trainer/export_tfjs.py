"""
Convert a trained Keras model to a TensorFlow.js graph-model.

Path: Keras model -> TF SavedModel (`model.export`) -> tfjs converter. The
resulting model.json has inputs `img_input` / `feature_input` and output
`output_0`, loadable in the browser with `tf.loadGraphModel(...)`.

Usable as a function (called by train.py) or standalone:
    python export_tfjs.py --model out/model.keras --output out/tfjs
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def convert(keras_path: str | Path, tfjs_dir: str | Path, quantize: str = "none", log=print) -> None:
    import tensorflow as tf

    # tensorflowjs imports tensorflow_hub lazily; stub it so conversion never
    # fails on environments where it isn't installed.
    if "tensorflow_hub" not in sys.modules:
        from unittest.mock import MagicMock

        sys.modules["tensorflow_hub"] = MagicMock()
        sys.modules["tensorflow_hub.estimator"] = MagicMock()
    from tensorflowjs.converters import convert_tf_saved_model

    keras_path = Path(keras_path)
    tfjs_dir = Path(tfjs_dir)
    saved_model_dir = tfjs_dir.parent / "_saved_model_tmp"

    log(f"[export] loading {keras_path}")
    model = tf.keras.models.load_model(str(keras_path))

    if saved_model_dir.exists():
        shutil.rmtree(saved_model_dir)
    log("[export] writing SavedModel")
    model.export(str(saved_model_dir))

    quant_map = {"uint8": "*"} if quantize == "uint8" else {"uint16": "*"} if quantize == "uint16" else None
    tfjs_dir.mkdir(parents=True, exist_ok=True)
    log(f"[export] converting to tfjs graph-model (quantize={quantize})")
    convert_tf_saved_model(
        saved_model_dir=str(saved_model_dir),
        output_dir=str(tfjs_dir),
        quantization_dtype_map=quant_map,
    )
    shutil.rmtree(saved_model_dir, ignore_errors=True)
    log(f"[export] done -> {tfjs_dir}/model.json")


def main() -> int:
    ap = argparse.ArgumentParser(description="Export Keras model to TF.js graph-model")
    ap.add_argument("--model", required=True, help="path to .keras model")
    ap.add_argument("--output", default="out/tfjs", help="tfjs output directory")
    ap.add_argument("--quantize", choices=["none", "uint8", "uint16"], default="none")
    args = ap.parse_args()
    convert(args.model, args.output, args.quantize)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
