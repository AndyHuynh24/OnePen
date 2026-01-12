#!/usr/bin/env python3
"""Dataset preparation and export for training.

This script processes raw stroke data, applies augmentation, and exports
processed data to data/processed/ for use with train.py.

Usage:
    python scripts/dataset.py --config config/config.yaml
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from modifiers.data.preprocessor import StrokePreprocessor
from modifiers.data.loader import StrokeDataLoader
from modifiers.data.augmenter import StrokeAugmenter
from modifiers.features.geometric import GeometricFeatureExtractor
from modifiers.features.renderer import StrokeRenderer
from modifiers.utils.config import load_config
from modifiers.utils.logging import setup_logging, get_logger

logger = get_logger("onepen.dataset")


def split_data(
    images: np.ndarray,
    labels: np.ndarray,
    features: np.ndarray,
    test_size: float = 0.10,
    val_size: float = 0.16,
    random_state: int = 42,
) -> dict[str, np.ndarray]:
    """Split data into train/val/test sets.

    Args:
        images: Image array.
        labels: Label array.
        features: Feature array.
        test_size: Fraction for test set.
        val_size: Fraction for validation set (from remaining after test).
        random_state: Random seed for reproducibility.

    Returns:
        Dictionary with train/val/test splits for each array.
    """
    # First split: train+val vs test
    (
        X_trainval_img, X_test_img,
        X_trainval_feat, X_test_feat,
        y_trainval, y_test
    ) = train_test_split(
        images, features, labels,
        test_size=test_size,
        stratify=labels,
        random_state=random_state,
    )

    # Second split: train vs val
    (
        X_train_img, X_val_img,
        X_train_feat, X_val_feat,
        y_train, y_val
    ) = train_test_split(
        X_trainval_img, X_trainval_feat, y_trainval,
        test_size=val_size,
        stratify=y_trainval,
        random_state=random_state,
    )

    logger.info(f"Data split: train={len(y_train)}, val={len(y_val)}, test={len(y_test)}")

    return {
        "X_train_img": X_train_img,
        "X_train_feat": X_train_feat,
        "y_train": y_train,
        "X_val_img": X_val_img,
        "X_val_feat": X_val_feat,
        "y_val": y_val,
        "X_test_img": X_test_img,
        "X_test_feat": X_test_feat,
        "y_test": y_test,
    }


def compute_class_weights_dict(labels: np.ndarray) -> dict[int, float]:
    """Compute balanced class weights.

    Args:
        labels: Array of class labels.

    Returns:
        Dictionary mapping class index to weight.
    """
    classes = np.unique(labels)
    weights = compute_class_weight(
        class_weight="balanced",
        classes=classes,
        y=labels,
    )
    weight_dict = dict(zip(classes.astype(int), weights))

    logger.info(f"Class weights: {weight_dict}")
    return weight_dict


def create_tf_dataset(
    images: np.ndarray,
    features: np.ndarray | None,
    labels: np.ndarray,
    batch_size: int = 32,
    shuffle: bool = True,
    shuffle_buffer: int | None = None,
):
    """Create TensorFlow dataset that streams data in batches.

    This is memory-efficient because:
    - Data is loaded in batches, not all at once
    - prefetch() loads next batch while GPU trains on current
    - Only batch_size samples in memory at a time

    Args:
        images: Image array.
        features: Feature array (None for image-only models).
        labels: Label array.
        batch_size: Number of samples per batch.
        shuffle: Whether to shuffle data each epoch.
        shuffle_buffer: Buffer size for shuffling (default: min(10000, len(labels))).

    Returns:
        tf.data.Dataset that yields (inputs, labels) batches.
    """
    import tensorflow as tf

    # Determine buffer size (smaller buffer = less RAM)
    if shuffle_buffer is None:
        shuffle_buffer = min(10000, len(labels))

    # Create dataset based on whether we have features
    if features is not None:
        dataset = tf.data.Dataset.from_tensor_slices((
            {"img_input": images, "feature_input": features},
            labels,
        ))
    else:
        dataset = tf.data.Dataset.from_tensor_slices((images, labels))

    # Shuffle if requested (uses buffer, not full dataset)
    if shuffle:
        dataset = dataset.shuffle(buffer_size=shuffle_buffer)

    # Batch the data
    dataset = dataset.batch(batch_size)

    # Prefetch: load next batch while GPU trains on current batch
    # This hides the data loading latency
    dataset = dataset.prefetch(tf.data.AUTOTUNE)

    return dataset


def prepare_and_export_data(
    config_path: Path,
    output_dir: Path,
    data_dir: Path | None = None,
) -> Path:
    """Process raw data and export to processed directory.

    This function:
    1. Loads raw stroke data from all contributors
    2. Preprocesses (normalizes) strokes
    3. Applies data augmentation
    4. Renders strokes to images
    5. Extracts geometric features
    6. Saves everything to output_dir as .npz files

    Args:
        config_path: Path to config.yaml file.
        output_dir: Directory to save processed data.
        data_dir: Override data directory (uses config if None).

    Returns:
        Path to the saved .npz file.
    """
    # Load configuration
    config = load_config(config_path)

    # Determine data directory
    if data_dir is None:
        data_dir = Path(__file__).parent.parent / "data" / "raw"

    logger.info(f"Loading data from: {data_dir}")
    logger.info(f"Output directory: {output_dir}")

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Initialize components
    loader = StrokeDataLoader(
        data_dir=data_dir,
        valid_classes=config.classes,
    )

    preprocessor = StrokePreprocessor(smooth=False, normalize=True)

    renderer = StrokeRenderer(
        img_size=config.features.image_size,
        to_rgb=True,
        normalize_pixels=True,
    )

    feature_extractor = GeometricFeatureExtractor(
        height_threshold=config.features.height_threshold,
        cap_value=config.features.cap_value,
    )

    # Load raw data
    raw_data = loader.load()
    logger.info(f"Loaded {len(raw_data)} raw samples")

    # Preprocess (clean + normalize)
    _, processed_data = preprocessor.process_dataset(raw_data, config.class_to_idx)
    logger.info(f"Preprocessed {len(processed_data)} samples")

    # Augment if enabled
    if config.augmentation.enabled:
        augmenter = StrokeAugmenter(
            num_augmentations=config.augmentation.num_augmentations,
            rotation_range=config.augmentation.rotation_range,
            shear_x_range=config.augmentation.shear_x_range,
            shear_y_range=config.augmentation.shear_y_range,
            scale_x_range=config.augmentation.scale_x_range,
            scale_y_range=config.augmentation.scale_y_range,
            flip_horizontal=config.augmentation.flip_horizontal,
            flip_exclude_types=config.augmentation.flip_exclude_types,
            rotation_exclude_types=config.augmentation.rotation_exclude_types,
            random_seed=config.data.random_state,
        )
        data = augmenter.augment_dataset(processed_data)
        logger.info(f"Augmented to {len(data)} samples")
    else:
        data = processed_data

    # Render images
    logger.info("Rendering stroke images...")
    images = renderer.render_dataset(data)
    logger.info(f"Images shape: {images.shape}")

    # Extract features
    logger.info("Extracting geometric features...")
    features = feature_extractor.extract_dataset(data)
    logger.info(f"Features shape: {features.shape}")

    # Collect labels
    labels = np.array(
        [config.class_to_idx[item["type"]] for item in data],
        dtype=np.int32
    )
    logger.info(f"Labels shape: {labels.shape}")

    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = output_dir / f"processed_data_{timestamp}.npz"

    # Save to .npz
    np.savez_compressed(
        output_file,
        images=images,
        features=features,
        labels=labels,
    )

    # Save metadata
    metadata = {
        "created_at": datetime.now().isoformat(),
        "num_samples": len(labels),
        "image_shape": list(images.shape),
        "feature_dim": features.shape[1],
        "num_classes": config.num_classes,
        "classes": config.classes,
        "class_to_idx": config.class_to_idx,
        "augmentation_enabled": config.augmentation.enabled,
        "augmentation_count": config.augmentation.num_augmentations if config.augmentation.enabled else 0,
    }

    metadata_file = output_file.with_suffix(".json")
    with open(metadata_file, "w") as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Saved processed data to: {output_file}")
    logger.info(f"Saved metadata to: {metadata_file}")

    # Also create a "latest" symlink/copy for convenience
    latest_file = output_dir / "latest.npz"
    latest_meta = output_dir / "latest.json"

    # On Windows, copy instead of symlink
    import shutil
    shutil.copy2(output_file, latest_file)
    shutil.copy2(metadata_file, latest_meta)
    logger.info(f"Created latest.npz link")

    return output_file


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Prepare and export training data",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/config.yaml"),
        help="Path to configuration file",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Override data directory from config",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Output directory for processed data (default: data/processed)",
    )
    return parser.parse_args()


def main() -> int:
    """Main function."""
    args = parse_args()

    # Setup logging
    setup_logging(level="INFO")

    logger.info("=" * 60)
    logger.info("OnePen Dataset Preparation")
    logger.info(f"Config: {args.config}")
    logger.info("=" * 60)

    # Determine output directory
    output_dir = args.output_dir
    if output_dir is None:
        output_dir = Path(__file__).parent.parent / "data" / "processed"

    # Process and export
    output_file = prepare_and_export_data(
        config_path=args.config,
        output_dir=output_dir,
        data_dir=args.data_dir,
    )

    logger.info("=" * 60)
    logger.info("Dataset Preparation Complete!")
    logger.info(f"Output: {output_file}")
    logger.info("")
    logger.info("Next steps:")
    logger.info("  1. (Optional) dvc add data/processed/")
    logger.info("  2. python scripts/train.py --config config/config.yaml")
    logger.info("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
