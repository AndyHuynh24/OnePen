#!/usr/bin/env python3
"""
OnePen Training Script
======================

Train the stroke classifier with two model architectures:
- hybrid: CNN backbone + 12 geometric features (default, recommended)
- image_only: CNN backbone only (baseline for comparison)

Usage:
    python scripts/train.py
    python scripts/train.py --epochs 100 --backbone mobilenetv3_small
    python scripts/train.py --model-type image_only  # baseline comparison
    python scripts/train.py --model-type hybrid      # with geometric features
"""

from __future__ import annotations

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import json
import argparse
from datetime import datetime

import numpy as np
from tensorflow import keras
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight

from modifiers.utils.config import load_config
from modifiers.utils.logging import setup_logging, get_logger
from modifiers.models.architecture import build_hybrid_model, build_image_only_model
from modifiers.models.trainer import StrokeModelTrainer


def parse_args():
    parser = argparse.ArgumentParser(description="Train OnePen stroke classifier")
    parser.add_argument("--config", type=Path, default=Path("config/config.yaml"))
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--backbone", type=str, default=None,
                        choices=["mobilenetv3_large", "mobilenetv3_small", "efficientnetv2"])
    parser.add_argument("--model-type", type=str, default=None,
                        choices=["hybrid", "image_only"],
                        help="Model type: 'hybrid' (CNN + geometric features) or 'image_only' (CNN baseline)")
    parser.add_argument("--resume", type=Path, default=None)
    parser.add_argument("--no-wandb", action="store_true", help="Disable Weights & Biases tracking")
    return parser.parse_args()


def load_data(processed_dir: Path, logger):
    """Load preprocessed data."""
    processed_file = processed_dir / "processed_data.npz"
    if not processed_file.exists():
        files = sorted(processed_dir.glob("processed_data_*.npz"),
                       key=lambda p: p.stat().st_mtime, reverse=True)
        if not files:
            raise FileNotFoundError(f"No processed data in {processed_dir}")
        processed_file = files[0]

    logger.info(f"Loading data from: {processed_file}")
    data = np.load(processed_file)
    return data["images"], data["features"], data["labels"]


def save_visualizations(history, y_true, y_pred, class_names, output_dir, logger):
    """Save training curves, confusion matrix, and classification report."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import seaborn as sns
    from sklearn.metrics import confusion_matrix, classification_report

    hist = history.history if hasattr(history, 'history') else history

    # Training curves
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    axes[0].plot(hist['loss'], label='Train')
    axes[0].plot(hist['val_loss'], label='Val')
    axes[0].set_title('Loss')
    axes[0].set_xlabel('Epoch')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    axes[1].plot(hist['accuracy'], label='Train')
    axes[1].plot(hist['val_accuracy'], label='Val')
    axes[1].set_title('Accuracy')
    axes[1].set_xlabel('Epoch')
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_dir / "training_curves.png", dpi=150)
    plt.close()
    logger.info("Saved training curves")

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred)
    cm_norm = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis]
    plt.figure(figsize=(12, 10))
    sns.heatmap(cm_norm, annot=True, fmt='.2%', cmap='Blues',
                xticklabels=class_names, yticklabels=class_names, square=True)
    plt.title('Confusion Matrix (Normalized)')
    plt.xlabel('Predicted')
    plt.ylabel('True')
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig(output_dir / "confusion_matrix.png", dpi=150)
    plt.close()
    logger.info("Saved confusion matrix")

    # Classification report
    report = classification_report(y_true, y_pred, target_names=class_names,
                                   output_dict=True, zero_division=0)
    with open(output_dir / "classification_report.json", 'w') as f:
        json.dump(report, f, indent=2)
    logger.info("Saved classification report")

    return report


def main() -> int:
    args = parse_args()

    # Load config and setup logging
    config = load_config(args.config)
    setup_logging(config.logging.level, config.logging.file)
    logger = get_logger("onepen.train")

    # Setup output directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(f"outputs/run_{timestamp}")
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info("=" * 60)
    logger.info("OnePen Training - Stroke Classifier")
    logger.info("=" * 60)
    logger.info(f"Output directory: {output_dir}")

    # ==========================================================================
    # 1. Load Data
    # ==========================================================================
    processed_dir = Path(__file__).parent.parent / "data" / "processed"
    images, features, labels = load_data(processed_dir, logger)
    images = images.astype(np.float32)
    features = features.astype(np.float32)

    logger.info(f"Loaded {len(labels)} samples")
    logger.info(f"  Images shape: {images.shape}")
    logger.info(f"  Features shape: {features.shape}")
    logger.info(f"  Classes: {np.unique(labels)}")

    # ==========================================================================
    # 2. Split Data
    # ==========================================================================
    indices = np.arange(len(labels))
    train_val_idx, test_idx = train_test_split(
        indices, test_size=config.data.test_size,
        stratify=labels, random_state=config.data.random_state
    )
    train_idx, val_idx = train_test_split(
        train_val_idx, test_size=config.data.val_size,
        stratify=labels[train_val_idx], random_state=config.data.random_state
    )

    logger.info(f"Data split: {len(train_idx)} train / {len(val_idx)} val / {len(test_idx)} test")

    # ==========================================================================
    # 3. Build Model
    # ==========================================================================
    backbone_name = args.backbone or getattr(config.model, "backbone", "mobilenetv3_small")
    model_type = args.model_type or getattr(config.model, "model_type", "hybrid")
    epochs = args.epochs or config.training.epochs
    batch_size = args.batch_size or config.training.batch_size

    # Prepare data based on model type
    if model_type == "image_only":
        # Image-only model: just pass images array
        x_train = images[train_idx]
        y_train = labels[train_idx]
        x_val = images[val_idx]
        y_val = labels[val_idx]
        x_test = images[test_idx]
        y_test = labels[test_idx]
        logger.info("Using image-only model (baseline for comparison)")
    else:
        # Hybrid model: pass dict with images and features
        x_train = {"img_input": images[train_idx], "feature_input": features[train_idx]}
        y_train = labels[train_idx]
        x_val = {"img_input": images[val_idx], "feature_input": features[val_idx]}
        y_val = labels[val_idx]
        x_test = {"img_input": images[test_idx], "feature_input": features[test_idx]}
        y_test = labels[test_idx]
        logger.info("Using hybrid model (CNN + geometric features)")

    if args.resume:
        logger.info(f"Resuming from: {args.resume}")
        model = keras.models.load_model(str(args.resume))
    elif model_type == "image_only":
        logger.info(f"Building image-only model with backbone: {backbone_name}")
        model = build_image_only_model(
            input_shape=[config.features.image_size, config.features.image_size, 3],
            num_classes=config.num_classes,
            learning_rate=config.training.learning_rate,
            backbone_trainable=config.model.backbone_trainable,
            use_se_attention=config.model.use_se_attention,
            fusion_units=config.model.fusion_units,
            backbone=backbone_name,
        )
    else:
        logger.info(f"Building hybrid model with backbone: {backbone_name}")
        model = build_hybrid_model(
            input_shape=[config.features.image_size, config.features.image_size, 3],
            num_classes=config.num_classes,
            feature_dim=features.shape[1],
            learning_rate=config.training.learning_rate,
            backbone_trainable=config.model.backbone_trainable,
            use_se_attention=config.model.use_se_attention,
            fusion_units=config.model.fusion_units,
            backbone=backbone_name,
        )

    logger.info(f"Model parameters: {model.count_params():,}")

    # ==========================================================================
    # 4. Compute Class Weights
    # ==========================================================================
    class_weights = None
    if config.training.use_class_weights:
        classes = np.unique(y_train)
        weights = compute_class_weight("balanced", classes=classes, y=y_train)
        class_weights = dict(zip(classes.astype(int), weights))
        logger.info(f"Using class weights: {class_weights}")

    # ==========================================================================
    # 5. Training
    # ==========================================================================
    trainer = StrokeModelTrainer(model, output_dir, "stroke_classifier")

    logger.info(f"Starting training: {epochs} epochs, batch size {batch_size}")

    history = trainer.train(
        x_train=x_train,
        y_train=y_train,
        x_val=x_val,
        y_val=y_val,
        epochs=epochs,
        batch_size=batch_size,
        class_weights=class_weights,
        early_stopping_patience=config.training.early_stopping.patience,
        reduce_lr_patience=config.training.reduce_lr.patience,
        use_tensorboard=True,
    )

    # ==========================================================================
    # 6. Evaluation
    # ==========================================================================
    test_metrics = trainer.evaluate(x_test, y_test, batch_size=batch_size)

    y_pred = np.argmax(trainer.predict(x_test), axis=1)
    y_true = y_test.astype(int)

    # ==========================================================================
    # 7. Save Artifacts
    # ==========================================================================
    report = save_visualizations(history, y_true, y_pred, config.classes, output_dir, logger)
    model_path = trainer.save_model()

    # Get best metrics
    hist = history.history
    best_metrics = {
        "best_val_accuracy": float(max(hist["val_accuracy"])),
        "best_val_loss": float(min(hist["val_loss"])),
        "final_train_accuracy": float(hist["accuracy"][-1]),
        "final_train_loss": float(hist["loss"][-1]),
        "epochs_trained": len(hist["accuracy"]),
    }

    # ==========================================================================
    # 8. Weights & Biases Logging
    # ==========================================================================
    if not args.no_wandb and config.wandb.enabled:
        try:
            import wandb

            run = wandb.init(
                project=config.wandb.project,
                entity=config.wandb.entity,
                name=f"train_{timestamp}",
                config={
                    # Model config
                    "model/type": model_type,
                    "model/backbone": backbone_name,
                    "model/backbone_trainable": config.model.backbone_trainable,
                    "model/use_se_attention": config.model.use_se_attention,
                    "model/fusion_units": str(config.model.fusion_units),
                    "model/num_classes": config.num_classes,
                    "model/total_params": model.count_params(),

                    # Training config
                    "training/epochs": epochs,
                    "training/batch_size": batch_size,
                    "training/learning_rate": config.training.learning_rate,
                    "training/use_class_weights": config.training.use_class_weights,
                    "training/early_stopping_patience": config.training.early_stopping.patience,
                    "training/reduce_lr_patience": config.training.reduce_lr.patience,

                    # Data config
                    "data/total_samples": len(labels),
                    "data/train_samples": len(train_idx),
                    "data/val_samples": len(val_idx),
                    "data/test_samples": len(test_idx),
                    "data/image_size": config.features.image_size,
                    "data/feature_dim": features.shape[1],
                },
            )

            # Log metrics
            wandb.log({
                # Test metrics
                "test_accuracy": test_metrics["test_accuracy"],
                "test_loss": test_metrics["test_loss"],

                # Best validation metrics
                "best_val_accuracy": best_metrics["best_val_accuracy"],
                "best_val_loss": best_metrics["best_val_loss"],

                # Final training metrics
                "final_train_accuracy": best_metrics["final_train_accuracy"],
                "final_train_loss": best_metrics["final_train_loss"],
                "epochs_trained": best_metrics["epochs_trained"],

                # Aggregate metrics
                "macro_f1": report["macro avg"]["f1-score"],
                "macro_precision": report["macro avg"]["precision"],
                "macro_recall": report["macro avg"]["recall"],
                "weighted_f1": report["weighted avg"]["f1-score"],
                "weighted_precision": report["weighted avg"]["precision"],
                "weighted_recall": report["weighted avg"]["recall"],
            })

            # Log per-class metrics
            for class_name in config.classes:
                if class_name in report:
                    wandb.log({
                        f"class_{class_name}_f1": report[class_name]["f1-score"],
                        f"class_{class_name}_precision": report[class_name]["precision"],
                        f"class_{class_name}_recall": report[class_name]["recall"],
                    })

            # Log confusion matrix
            y_true_names = [config.classes[i] for i in y_true]
            y_pred_names = [config.classes[i] for i in y_pred]
            wandb.log({
                "confusion_matrix": wandb.plot.confusion_matrix(
                    probs=None,
                    y_true=y_true_names,
                    preds=y_pred_names,
                    class_names=config.classes,
                )
            })

            # Log output artifacts
            artifact = wandb.Artifact(f"train_{timestamp}", type="output")
            artifact.add_dir(str(output_dir))
            run.log_artifact(artifact)

            # Log model artifact
            if config.wandb.log_model:
                model_artifact = wandb.Artifact(f"model_{timestamp}", type="model")
                model_artifact.add_file(str(model_path))
                run.log_artifact(model_artifact)

            run.finish()
            logger.info("W&B run logged successfully")

        except Exception as e:
            logger.warning(f"W&B logging failed: {e}")

    # ==========================================================================
    # 9. Summary
    # ==========================================================================
    logger.info("=" * 60)
    logger.info("Training Complete!")
    logger.info(f"  Model Type: {model_type}")
    logger.info(f"  Backbone: {backbone_name}")
    logger.info(f"  Best Val Accuracy: {best_metrics['best_val_accuracy']:.4f}")
    logger.info(f"  Test Accuracy: {test_metrics['test_accuracy']:.4f}")
    logger.info(f"  Macro F1: {report['macro avg']['f1-score']:.4f}")
    logger.info(f"  Epochs Trained: {best_metrics['epochs_trained']}")
    logger.info(f"  Model saved to: {model_path}")
    logger.info(f"  Outputs: {output_dir}")
    logger.info("=" * 60)

    # --- AkashTrainer integration ---------------------------------------------
    # Publish metrics + model back to source GitHub repo so AkashTrainer's
    # monitor picks them up. No-ops gracefully when REPO_URL / GITHUB_TOKEN
    # aren't set (local dev path).
    try:
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from akash_train import publish_results

        hist = history.history if hasattr(history, "history") else {}
        arr = lambda k: [float(x) for x in (hist.get(k) or [])]

        result = publish_results(
            success=True,
            metrics={
                "test_accuracy": float(test_metrics["test_accuracy"]),
                "test_loss": float(test_metrics["test_loss"]),
                "val_accuracy": float(best_metrics["best_val_accuracy"]),
                "val_loss": float(best_metrics["best_val_loss"]),
                "macro_f1": float(report["macro avg"]["f1-score"]),
                "macro_precision": float(report["macro avg"]["precision"]),
                "macro_recall": float(report["macro avg"]["recall"]),
                "weighted_f1": float(report["weighted avg"]["f1-score"]),
                "epochs_trained": int(best_metrics["epochs_trained"]),
                "final_train_accuracy": float(best_metrics["final_train_accuracy"]),
                # Per-epoch curves render as overlaid training-curve charts in the UI
                "train_acc_curve": arr("accuracy"),
                "val_acc_curve": arr("val_accuracy"),
                "train_loss_curve": arr("loss"),
                "val_loss_curve": arr("val_loss"),
            },
            model_path=str(model_path) if Path(model_path).exists() else None,
            hyperparams={
                "model_type": model_type,
                "backbone": backbone_name,
                "epochs": epochs,
                "batch_size": batch_size,
                "learning_rate": float(config.training.learning_rate),
            },
        )
        if result:
            logger.info(f"✅ Published to {result.branch_url}")
        else:
            logger.info(f"(akash_train) {result.reason}")
    except Exception as e:
        logger.warning(f"Could not publish results via akash_train: {e}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
