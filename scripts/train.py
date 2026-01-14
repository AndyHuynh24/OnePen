#!/usr/bin/env python3
"""Main training script for OnePen stroke classifier.

Usage:
    python scripts/train.py --config config/config.yaml

This script:
1. Loads preprocessed data from data/processed/
2. Builds the hybrid CNN model
3. Trains with MLflow experiment tracking
4. Evaluates on test set
5. Saves the best model
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import json
import mlflow
import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt
import seaborn as sns

from modifiers.models.architecture import build_hybrid_model
from modifiers.models.trainer import StrokeModelTrainer
from modifiers.utils.config import load_config
from modifiers.utils.logging import setup_logging, get_logger

# Import dataset utilities
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import confusion_matrix, classification_report



def split_data(
    images: np.ndarray,
    labels: np.ndarray,
    features: np.ndarray,
    test_size: float = 0.10,
    val_size: float = 0.16,
    random_state: int = 42,
) -> dict[str, np.ndarray]:
    """Split data into train/val/test sets using index-based splitting.
    
    This is memory-efficient because we split indices first, then index
    into the arrays only when needed, avoiding large intermediate copies.
    """
    n_samples = len(labels)
    indices = np.arange(n_samples)
    
    # First split: train+val vs test (split indices only)
    idx_trainval, idx_test = train_test_split(
        indices,
        test_size=test_size,
        stratify=labels,
        random_state=random_state,
    )
    
    # Second split: train vs val (split indices only)
    idx_train, idx_val = train_test_split(
        idx_trainval,
        test_size=val_size,
        stratify=labels[idx_trainval],
        random_state=random_state,
    )
    
    # Now index into arrays (this creates views where possible)
    return {
        "X_train_img": images[idx_train],
        "X_train_feat": features[idx_train],
        "y_train": labels[idx_train],
        "X_val_img": images[idx_val],
        "X_val_feat": features[idx_val],
        "y_val": labels[idx_val],
        "X_test_img": images[idx_test],
        "X_test_feat": features[idx_test],
        "y_test": labels[idx_test],
    }


def compute_class_weights_dict(labels: np.ndarray) -> dict[int, float]:
    """Compute balanced class weights."""
    classes = np.unique(labels)
    weights = compute_class_weight(
        class_weight="balanced",
        classes=classes,
        y=labels,
    )
    return dict(zip(classes.astype(int), weights))


def save_confusion_matrix(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    class_names: list[str],
    output_path: Path,
) -> Path:
    """Generate and save confusion matrix visualization.
    
    Args:
        y_true: Ground truth labels.
        y_pred: Predicted labels.
        class_names: List of class names.
        output_path: Path to save the image.
        
    Returns:
        Path to saved image.
    """
    cm = confusion_matrix(y_true, y_pred)
    
    # Normalize for percentages
    cm_normalized = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis]
    
    plt.figure(figsize=(12, 10))
    sns.heatmap(
        cm_normalized,
        annot=True,
        fmt='.2%',
        cmap='Blues',
        xticklabels=class_names,
        yticklabels=class_names,
        square=True,
    )
    plt.title('Confusion Matrix (Normalized)', fontsize=14)
    plt.ylabel('True Label', fontsize=12)
    plt.xlabel('Predicted Label', fontsize=12)
    plt.xticks(rotation=45, ha='right')
    plt.yticks(rotation=0)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    return output_path


def save_training_curves(history: dict, output_path: Path) -> Path:
    """Generate and save training curves visualization.
    
    Args:
        history: Training history dictionary with loss and accuracy.
        output_path: Path to save the image.
        
    Returns:
        Path to saved image.
    """
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    # Loss curve
    axes[0].plot(history.get('loss', []), label='Train Loss', linewidth=2)
    axes[0].plot(history.get('val_loss', []), label='Val Loss', linewidth=2)
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('Loss')
    axes[0].set_title('Training & Validation Loss')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    
    # Accuracy curve
    axes[1].plot(history.get('accuracy', []), label='Train Accuracy', linewidth=2)
    axes[1].plot(history.get('val_accuracy', []), label='Val Accuracy', linewidth=2)
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('Accuracy')
    axes[1].set_title('Training & Validation Accuracy')
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    return output_path


def save_per_class_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    class_names: list[str],
    output_path: Path,
) -> dict:
    """Generate per-class metrics and save as JSON + bar chart.
    
    Args:
        y_true: Ground truth labels.
        y_pred: Predicted labels.
        class_names: List of class names.
        output_path: Path to save (without extension).
        
    Returns:
        Dictionary with per-class metrics.
    """
    report = classification_report(
        y_true, y_pred,
        target_names=class_names,
        output_dict=True,
        zero_division=0,
    )
    
    # Save as JSON
    json_path = output_path.with_suffix('.json')
    with open(json_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Create bar chart of per-class accuracy (recall)
    class_metrics = {name: report[name] for name in class_names if name in report}
    names = list(class_metrics.keys())
    recalls = [class_metrics[n]['recall'] for n in names]
    precisions = [class_metrics[n]['precision'] for n in names]
    f1s = [class_metrics[n]['f1-score'] for n in names]
    
    x = np.arange(len(names))
    width = 0.25
    
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.bar(x - width, precisions, width, label='Precision', color='steelblue')
    ax.bar(x, recalls, width, label='Recall', color='darkorange')
    ax.bar(x + width, f1s, width, label='F1-Score', color='green')
    
    ax.set_xlabel('Class')
    ax.set_ylabel('Score')
    ax.set_title('Per-Class Metrics')
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=45, ha='right')
    ax.legend()
    ax.set_ylim(0, 1.1)
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    plt.savefig(output_path.with_suffix('.png'), dpi=150, bbox_inches='tight')
    plt.close()
    
    return report


def create_tf_dataset(
    images: np.ndarray,
    features: np.ndarray | None,
    labels: np.ndarray,
    batch_size: int = 32,
    shuffle: bool = True,
    shuffle_buffer: int | None = None,
):
    """Create TensorFlow dataset that streams data in batches.

    Uses from_generator to avoid copying the entire dataset into memory.
    """
    if shuffle_buffer is None:
        shuffle_buffer = min(10000, len(labels))

    num_samples = len(labels)

    if features is not None:
        def generator():
            indices = np.arange(num_samples)
            if shuffle:
                np.random.shuffle(indices)
            for i in indices:
                yield (
                    {"img_input": images[i], "feature_input": features[i]},
                    labels[i],
                )

        output_signature = (
            {
                "img_input": tf.TensorSpec(shape=images.shape[1:], dtype=tf.float32),
                "feature_input": tf.TensorSpec(shape=features.shape[1:], dtype=tf.float32),
            },
            tf.TensorSpec(shape=labels.shape[1:], dtype=tf.float32),
        )
    else:
        def generator():
            indices = np.arange(num_samples)
            if shuffle:
                np.random.shuffle(indices)
            for i in indices:
                yield images[i], labels[i]

        output_signature = (
            tf.TensorSpec(shape=images.shape[1:], dtype=tf.float32),
            tf.TensorSpec(shape=labels.shape[1:], dtype=tf.float32),
        )

    dataset = tf.data.Dataset.from_generator(
        generator,
        output_signature=output_signature,
    )

    dataset = dataset.batch(batch_size)
    dataset = dataset.prefetch(tf.data.AUTOTUNE)

    return dataset


def load_processed_data(processed_dir: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    """Load preprocessed data from data/processed/ directory.
    
    Args:
        processed_dir: Path to processed data directory.
        
    Returns:
        Tuple of (images, features, labels, metadata).
    """
    # Try to load latest.npz first, fall back to most recent file
    latest_file = processed_dir / "processed_data.npz"
    
    if latest_file.exists():
        npz_file = latest_file
        meta_file = processed_dir / "processed_data.json"
    else:
        # Find most recent .npz file
        npz_files = sorted(
            processed_dir.glob("processed_data_*.npz"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not npz_files:
            raise FileNotFoundError(
                f"No processed data found in {processed_dir}. "
                "Run 'python scripts/dataset.py' first."
            )
        npz_file = npz_files[0]
        meta_file = npz_file.with_suffix(".json")
    
    # Load arrays
    data = np.load(npz_file)
    images = data["images"]
    features = data["features"]
    labels = data["labels"]
    
    # Load metadata
    metadata = {}
    if meta_file.exists():
        with open(meta_file) as f:
            metadata = json.load(f)
    
    return images, features, labels, metadata


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Train OnePen stroke classifier",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("config/config.yaml"),
        help="Path to configuration file",
    )
    parser.add_argument(
        "--processed-dir",
        type=Path,
        default=None,
        help="Directory with processed data (default: data/processed)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs"),
        help="Output directory for models and logs",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=None,
        help="Override epochs from config",
    )
    parser.add_argument(
        "--resume",
        type=Path,
        default=None,
        help="Path to checkpoint to resume training from",
    )
    parser.add_argument(
        "--backbone",
        type=str,
        default=None,
        choices=["mobilenetv3_large", "mobilenetv3_small", "efficientnetv2", "custom_cnn"],
        help="Override backbone from config",
    )
    return parser.parse_args()


def main() -> int:
    """Main training function."""
    args = parse_args()

    # Load configuration
    config = load_config(args.config)

    # Setup logging
    setup_logging(
        level=config.logging.level,
        log_file=config.logging.file,
    )
    logger = get_logger("onepen.train")

    logger.info("=" * 60)
    logger.info("OnePen Stroke Classifier Training")
    logger.info(f"Config: {args.config}")
    logger.info("=" * 60)

    # Determine processed data directory
    processed_dir = args.processed_dir
    if processed_dir is None:
        processed_dir = Path(__file__).parent.parent / "data" / "processed"

    logger.info(f"Loading processed data from: {processed_dir}")

    # Load preprocessed data
    images, features, labels, metadata = load_processed_data(processed_dir)
    
    logger.info(f"Images shape: {images.shape}")
    logger.info(f"Features shape: {features.shape}")
    logger.info(f"Labels shape: {labels.shape}")
    if metadata:
        logger.info(f"Data created: {metadata.get('created_at', 'unknown')}")

    # Create output directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = args.output_dir / f"run_{timestamp}"
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Output directory: {output_dir}")

    # ========== Split Data ==========
    logger.info("Splitting data...")
    splits = split_data(
        images=images,
        labels=labels,
        features=features,
        test_size=config.data.test_size,
        val_size=config.data.val_size,
        random_state=config.data.random_state,
    )
    
    logger.info(f"Train samples: {len(splits['y_train'])}")
    logger.info(f"Val samples: {len(splits['y_val'])}")
    logger.info(f"Test samples: {len(splits['y_test'])}")

    # ========== Compute Class Weights ==========
    class_weights = None
    if config.training.use_class_weights:
        class_weights = compute_class_weights_dict(splits["y_train"])
        logger.info(f"Class weights: {class_weights}")

    # ========== Build or Resume Model ==========
    if args.resume:
        logger.info(f"Resuming from checkpoint: {args.resume}")
        model = tf.keras.models.load_model(str(args.resume))
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=config.training.learning_rate),
            loss="sparse_categorical_crossentropy",
            metrics=["accuracy"],
        )
        backbone_name = "resumed"
    else:
        backbone_name = args.backbone or getattr(config.model, "backbone", "mobilenetv3_large")
        logger.info(f"Building hybrid model with backbone: {backbone_name}")

        model = build_hybrid_model(
            input_shape= [config.features.image_size, config.features.image_size, 3],
            num_classes=config.num_classes,
            feature_dim=features.shape[1],
            learning_rate=config.training.learning_rate,
            backbone_trainable=config.model.backbone_trainable,
            use_se_attention=config.model.use_se_attention,
            fusion_units=config.model.fusion_units,
            backbone=backbone_name,
        )

    # ========== Setup MLflow ==========
    mlflow.set_tracking_uri(config.mlflow.tracking_uri)
    mlflow.set_experiment(config.mlflow.experiment_name)
    mlflow.start_run(run_name=f"train_{timestamp}")

    mlflow.log_params({
        "model_name": config.model.name,
        "backbone": backbone_name,
        "resumed_from": str(args.resume) if args.resume else "none",
        "num_classes": config.num_classes,
        "feature_dim": features.shape[1],
        "image_size": config.features.image_size,
        "learning_rate": config.training.learning_rate,
        "batch_size": config.training.batch_size,
        "epochs": args.epochs or config.training.epochs,
        "total_samples": len(labels),
        "train_samples": len(splits["y_train"]),
        "val_samples": len(splits["y_val"]),
        "test_samples": len(splits["y_test"]),
    })

    # ========== Create tf.data.Dataset ==========
    logger.info("Creating tf.data.Dataset pipelines...")

    train_dataset = create_tf_dataset(
        images=splits["X_train_img"],
        features=splits["X_train_feat"],
        labels=splits["y_train"],
        batch_size=config.training.batch_size,
        shuffle=True,
    )

    val_dataset = create_tf_dataset(
        images=splits["X_val_img"],
        features=splits["X_val_feat"],
        labels=splits["y_val"],
        batch_size=config.training.batch_size,
        shuffle=False,
    )

    logger.info(f"Train batches: {len(splits['y_train']) // config.training.batch_size}")
    logger.info(f"Val batches: {len(splits['y_val']) // config.training.batch_size}")

    # ========== Train ==========
    logger.info("Starting training...")
    trainer = StrokeModelTrainer(
        model=model,
        output_dir=output_dir,
        experiment_name=config.mlflow.experiment_name,
    )

    epochs = args.epochs or config.training.epochs
    history = trainer.train(
        train_dataset=train_dataset,
        val_dataset=val_dataset,
        epochs=epochs,
        class_weights=class_weights,
        early_stopping_patience=config.training.early_stopping.patience,
        reduce_lr_patience=config.training.reduce_lr.patience,
    )

    # ========== Evaluate ==========
    logger.info("Evaluating on test set...")
    test_dataset = create_tf_dataset(
        images=splits["X_test_img"],
        features=splits["X_test_feat"],
        labels=splits["y_test"],
        batch_size=config.training.batch_size,
        shuffle=False,
    )
    test_metrics = trainer.evaluate(test_dataset=test_dataset)

    # ========== Generate Predictions for Visualizations ==========
    logger.info("Generating predictions for visualizations...")
    y_pred_probs = model.predict(test_dataset, verbose=0)
    y_pred = np.argmax(y_pred_probs, axis=1)
    y_true = splits["y_test"].astype(int)

    # ========== Save Visualizations ==========
    logger.info("Saving visualizations...")
    
    # Training curves
    if hasattr(history, 'history'):
        history_dict = history.history
    else:
        history_dict = history if isinstance(history, dict) else {}
    
    curves_path = save_training_curves(
        history_dict,
        output_dir / "training_curves.png"
    )
    logger.info(f"Training curves saved to: {curves_path}")
    
    # Confusion matrix
    cm_path = save_confusion_matrix(
        y_true, y_pred,
        class_names=config.classes,
        output_path=output_dir / "confusion_matrix.png"
    )
    logger.info(f"Confusion matrix saved to: {cm_path}")
    
    # Per-class metrics (saves both JSON and PNG)
    class_report = save_per_class_metrics(
        y_true, y_pred,
        class_names=config.classes,
        output_path=output_dir / "classification_report"
    )
    logger.info(f"Classification report saved to: {output_dir / 'classification_report.json'}")

    # ========== Log Metrics to MLflow ==========
    best_metrics = trainer.get_best_metrics()
    mlflow.log_metrics({
        "best_val_accuracy": best_metrics["best_val_accuracy"],
        "best_val_loss": best_metrics["best_val_loss"],
        "test_accuracy": test_metrics["test_accuracy"],
        "test_loss": test_metrics["test_loss"],
        "epochs_trained": best_metrics["epochs_trained"],
    })
    
    # Log overall F1 scores (no per-class breakdown)
    if "macro avg" in class_report:
        mlflow.log_metric("macro_f1", class_report["macro avg"]["f1-score"])
    if "weighted avg" in class_report:
        mlflow.log_metric("weighted_f1", class_report["weighted avg"]["f1-score"])
    
    # Log visualizations as artifacts
    mlflow.log_artifact(str(curves_path))
    mlflow.log_artifact(str(cm_path))
    mlflow.log_artifact(str(output_dir / "confusion_matrix.png"))
    mlflow.log_artifact(str(output_dir / "training_curves.png"))

    # ========== Save Model ==========
    model_path = trainer.save_model()
    logger.info(f"Model saved to {model_path}")

    mlflow.log_artifact(str(model_path))
    mlflow.end_run()

    # ========== Summary ==========
    logger.info("=" * 60)
    logger.info("Training Complete!")
    logger.info(f"Best val accuracy: {trainer.get_best_metrics()['best_val_accuracy']:.4f}")
    logger.info(f"Test accuracy: {test_metrics['test_accuracy']:.4f}")
    logger.info(f"Model saved to: {model_path}")
    logger.info("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
