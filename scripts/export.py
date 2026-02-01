#!/usr/bin/env python3
"""Export trained Keras model to TensorFlow.js format.
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
        type=str,
        choices=["none", "uint8", "uint16"],
        default="none",
        help="Quantization type: none (no quantization), uint16 (recommended), uint8 (smallest but may hurt accuracy)",
    )
    return parser.parse_args()

def convert_to_tfjs(keras_path: Path, tfjs_path: Path, quantize: str = "none") -> bool:
    """Convert Keras model to TensorFlow.js GraphModel format.
    """
    import os
    import stat
    import time
    import shutil
    import tensorflow as tf
    import sys
    from unittest.mock import MagicMock
    
    # === Compatibility shim for tensorflow_hub + TF 2.x ===
    if 'tensorflow_hub' not in sys.modules:
        mock_hub = MagicMock()
        sys.modules['tensorflow_hub'] = mock_hub
        # Also mock submodules often imported
        sys.modules['tensorflow_hub.estimator'] = MagicMock()
    # === End compatibility shim ===
    
    from tensorflowjs.converters import convert_tf_saved_model

    logger = get_logger("onepen.export")

    def _remove_readonly(func, path, _):
        """Clear read-only bit and retry deletion (Windows fix)."""
        os.chmod(path, stat.S_IWRITE)
        func(path)

    try:
        # Load and export to SavedModel
        logger.info(f"Loading model from {keras_path}")
        model = tf.keras.models.load_model(str(keras_path))
        logger.info(f"Model loaded: {model.name}")

        saved_model_path = tfjs_path.parent / "saved_model_temp"

        # Ensure clean temp directory
        if saved_model_path.exists():
            logger.info("Removing existing temporary SavedModel directory...")
            shutil.rmtree(saved_model_path, onerror=_remove_readonly)

        logger.info("Exporting to SavedModel format...")
        model.export(str(saved_model_path))

        # Convert using Python API (avoids tensorflow_hub import issue)
        tfjs_path.mkdir(parents=True, exist_ok=True)
        
        logger.info("Converting SavedModel to TensorFlow.js format...")

        # Set quantization based on option
        quant_map = None
        if quantize == "uint8":
            quant_map = {"uint8": "*"}
            logger.info("Using uint8 quantization (smallest size, may affect accuracy)")
        elif quantize == "uint16":
            quant_map = {"uint16": "*"}
            logger.info("Using uint16 quantization (good balance of size and accuracy)")
        else:
            logger.info("No quantization (best accuracy, larger size)")

        convert_tf_saved_model(
            saved_model_dir=str(saved_model_path),
            output_dir=str(tfjs_path),
            quantization_dtype_map=quant_map,
        )

        # SCleanup 
        logger.info("Cleaning up temporary SavedModel...")
        time.sleep(1.5)  # 🔑 allow Windows to release file locks

        try:
            shutil.rmtree(saved_model_path, onerror=_remove_readonly)
        except PermissionError:
            logger.warning(
                "Could not fully remove temporary SavedModel (file lock). "
                "You can delete it manually later."
            )

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
        output_dir = Path(__file__).parent.parent / "models" / "tfjs"
    else:
        output_dir = args.output

    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 60)
    logger.info("TensorFlow.js Model Export")
    logger.info(f"Input: {args.model}")
    logger.info(f"Output: {output_dir}")
    logger.info(f"Quantization: {args.quantize}")
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
