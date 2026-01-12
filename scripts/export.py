#!/usr/bin/env python3
"""Export trained Keras model to TensorFlow.js format.

Usage:
    python scripts/export.py --model outputs/run_xxx/checkpoints/best_model.keras

This exports the model for browser-based inference.
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from modifiers.utils.logging import setup_logging, get_logger



def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Export Keras model to TensorFlow.js",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--model",
        type=Path,
        required=True,
        help="Path to trained Keras model (.keras file)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output directory for TFJS model (default: models/tfjs)",
    )
    parser.add_argument(
        "--quantize",
        action="store_true",
        help="Quantize weights for smaller model size",
    )
    return parser.parse_args()


def convert_to_tfjs(keras_path: Path, tfjs_path: Path, quantize: bool = False) -> bool:
    """Convert Keras model to TensorFlow.js GraphModel format.

    Args:
        keras_path: Path to Keras model file.
        tfjs_path: Output path for TFJS model.
        quantize: Whether to quantize weights.

    Returns:
        True if successful.
    """
    import shutil
    import subprocess
    import tensorflow as tf

    logger = get_logger("onepen.export")

    try:
        # Step 1: Load and export to SavedModel
        logger.info(f"Loading model from {keras_path}")
        model = tf.keras.models.load_model(str(keras_path))
        logger.info(f"Model loaded: {model.name}")

        saved_model_path = tfjs_path.parent / "saved_model_temp"
        if saved_model_path.exists():
            shutil.rmtree(saved_model_path)

        logger.info(f"Exporting to SavedModel format...")
        model.export(str(saved_model_path))

        # Step 2: Use tensorflowjs_converter CLI
        tfjs_path.mkdir(parents=True, exist_ok=True)

        cmd = [
            "tensorflowjs_converter",
            "--input_format=tf_saved_model",
            "--output_format=tfjs_graph_model",
        ]
        if quantize:
            cmd.append("--quantize_uint8=*")

        cmd.extend([str(saved_model_path), str(tfjs_path)])

        logger.info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            logger.error(f"Converter failed: {result.stderr}")
            # Keep SavedModel for manual conversion
            logger.info(f"SavedModel available at: {saved_model_path}")
            return False

        # Cleanup
        shutil.rmtree(saved_model_path, ignore_errors=True)

        logger.info("Conversion successful!")
        return True

    except Exception as e:
        logger.error(f"Export failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main() -> int:
    """Main export function."""
    args = parse_args()

    logger = setup_logging(level="INFO")
    logger = get_logger("onepen.export")

    # Validate input
    if not args.model.exists():
        logger.error(f"Model not found: {args.model}")
        return 1

    # Setup output paths
    if args.output is None:
        output_dir = Path(__file__).parent.parent.parent / "models" / "tfjs"
    else:
        output_dir = args.output

    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 60)
    logger.info("TensorFlow.js Model Export")
    logger.info(f"Input: {args.model}")
    logger.info(f"Output: {output_dir}")
    logger.info(f"Quantize: {args.quantize}")
    logger.info("=" * 60)

    # Convert directly to TFJS using Python API
    if not convert_to_tfjs(args.model, output_dir, args.quantize):
        return 1

    logger.info("=" * 60)
    logger.info("Export Complete!")
    logger.info(f"TFJS GraphModel saved to: {output_dir}")
    logger.info("")
    logger.info("To use in browser:")
    logger.info("  const model = await tf.loadGraphModel('model.json');")
    logger.info("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
