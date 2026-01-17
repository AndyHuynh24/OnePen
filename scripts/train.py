#!/usr/bin/env python3
"""Main training script for OnePen stroke classifier."""

import argparse
import sys
import json
import mlflow
import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import confusion_matrix, classification_report

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from modifiers.models.architecture import build_hybrid_model
from modifiers.models.trainer import StrokeModelTrainer
from modifiers.utils.config import load_config
from modifiers.utils.logging import setup_logging, get_logger
from modifiers.data.generator import StrokeDataGenerator

# =============================================================================
# Helper Functions
# =============================================================================

def compute_class_weights_dict(labels: np.ndarray) -> dict[int, float]:
    """Compute balanced class weights."""
    classes = np.unique(labels)
    weights = compute_class_weight(class_weight="balanced", classes=classes, y=labels)
    return dict(zip(classes.astype(int), weights))

def save_confusion_matrix(y_true, y_pred, class_names, output_path):
    """Generate and save confusion matrix visualization."""
    cm = confusion_matrix(y_true, y_pred)
    cm_normalized = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis]
    
    plt.figure(figsize=(12, 10))
    sns.heatmap(cm_normalized, annot=True, fmt='.2%', cmap='Blues',
                xticklabels=class_names, yticklabels=class_names, square=True)
    plt.title('Confusion Matrix (Normalized)', fontsize=14)
    plt.xlabel('Predicted Label')
    plt.ylabel('True Label')
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    return output_path

def save_training_curves(history, output_path):
    """Generate and save training curves visualization."""
    if hasattr(history, 'history'): history = history.history
    elif not isinstance(history, dict): history = {}
    
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    metrics = [('loss', 'Loss'), ('accuracy', 'Accuracy')]
    
    for i, (metric, name) in enumerate(metrics):
        axes[i].plot(history.get(metric, []), label=f'Train {name}')
        axes[i].plot(history.get(f'val_{metric}', []), label=f'Val {name}')
        axes[i].set_title(f'Training & Validation {name}')
        axes[i].set_xlabel('Epoch')
        axes[i].set_ylabel(name)
        axes[i].legend()
        axes[i].grid(True, alpha=0.3)
        
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    return output_path

def save_per_class_metrics(y_true, y_pred, class_names, output_path):
    """Generate per-class metrics and save as JSON + bar chart."""
    report = classification_report(y_true, y_pred, target_names=class_names, 
                                   output_dict=True, zero_division=0)
    
    with open(output_path.with_suffix('.json'), 'w') as f:
        json.dump(report, f, indent=2)
        
    recalls = [report[n]['recall'] for n in class_names if n in report]
    precisions = [report[n]['precision'] for n in class_names if n in report]
    f1s = [report[n]['f1-score'] for n in class_names if n in report]
    
    x = np.arange(len(class_names))
    width = 0.25
    plt.figure(figsize=(12, 6))
    plt.bar(x - width, precisions, width, label='Precision')
    plt.bar(x, recalls, width, label='Recall')
    plt.bar(x + width, f1s, width, label='F1-Score')
    plt.xticks(x, class_names, rotation=45, ha='right')
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path.with_suffix('.png'))
    plt.close()
    return report

def load_processed_data(processed_dir: Path):
    """Load preprocessed data from data/processed/ directory."""
    processed_file = processed_dir / "processed_data.npz"
    if not processed_file.exists():
        files = sorted(processed_dir.glob("processed_data_*.npz"), 
                       key=lambda p: p.stat().st_mtime, reverse=True)
        if not files:
            raise FileNotFoundError(f"No processed data in {processed_dir}")
        processed_file = files[0]
    
    data = np.load(processed_file)
    meta_file = processed_file.with_suffix(".json")
    metadata = json.load(open(meta_file)) if meta_file.exists() else {}
    return data["images"], data["features"], data["labels"], metadata

# =============================================================================
# Main Training Logic
# =============================================================================

def parse_args():
    parser = argparse.ArgumentParser(description="Train OnePen stroke classifier")
    parser.add_argument("--config", type=Path, default=Path("config/config.yaml"))
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--resume", type=Path, default=None)
    parser.add_argument("--backbone", type=str, default=None)
    return parser.parse_args()

def main():
    args = parse_args()
    config = load_config(args.config)
    setup_logging(config.logging.level, config.logging.file)
    logger = get_logger("onepen.train")

    # 1. Setup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(f"outputs/run_{timestamp}")
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Output directory: {output_dir}")

    # 2. Data Loading
    processed_dir = Path(__file__).parent.parent / "data" / "processed"
    images, features, labels, _ = load_processed_data(processed_dir)
    logger.info(f"Loaded data: {len(labels)} samples")

    # 3. Splitting (Train+Val vs Test, then Train vs Val)
    indices = np.arange(len(labels))
    train_val_idx, test_idx = train_test_split(
        indices, test_size=config.data.test_size, stratify=labels, 
        random_state=config.data.random_state
    )
    train_idx, val_idx = train_test_split(
        train_val_idx, test_size=config.data.val_size, stratify=labels[train_val_idx], 
        random_state=config.data.random_state
    )
    
    # 4. Generators
    train_gen = StrokeDataGenerator(images[train_idx], labels[train_idx], features[train_idx], 
                                    batch_size=config.training.batch_size, shuffle=True)
    val_gen = StrokeDataGenerator(images[val_idx], labels[val_idx], features[val_idx], 
                                  batch_size=config.training.batch_size, shuffle=False)
    test_gen = StrokeDataGenerator(images[test_idx], labels[test_idx], features[test_idx], 
                                   batch_size=config.training.batch_size, shuffle=False)
    
    logger.info(f"Train/Val/Test sizes: {len(train_idx)} / {len(val_idx)} / {len(test_idx)}")

    # 5. Model Building
    if args.resume:
        logger.info(f"Resuming: {args.resume}")
        model = tf.keras.models.load_model(str(args.resume))
        backbone_name = "resumed"
    else:
        backbone_name = args.backbone or getattr(config.model, "backbone", "mobilenetv3_large")
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

    # 6. MLFlow Tracking
    mlflow.set_tracking_uri(config.mlflow.tracking_uri)
    mlflow.set_experiment(config.mlflow.experiment_name)
    mlflow.start_run(run_name=f"train_{timestamp}")
    mlflow.log_params({
        "backbone": backbone_name, "epochs": args.epochs or config.training.epochs,
        "batch_size": config.training.batch_size, "samples": len(labels)
    })

    # 7. Training
    trainer = StrokeModelTrainer(model, output_dir, config.mlflow.experiment_name)
    class_weights = compute_class_weights_dict(labels[train_idx]) if config.training.use_class_weights else None
    
    history = trainer.train(
        train_data=train_gen,
        val_data=val_gen,
        epochs=args.epochs or config.training.epochs,
        class_weights=class_weights,
        early_stopping_patience=config.training.early_stopping.patience,
        reduce_lr_patience=config.training.reduce_lr.patience
    )

    # 8. Evaluation & Visualization
    test_metrics = trainer.evaluate(test_gen)
    
    # Get predictions for plots
    y_pred = np.argmax(model.predict(test_gen, verbose=0), axis=1)
    y_true = labels[test_idx].astype(int)
    
    # Save Artifacts
    save_training_curves(history, output_dir / "training_curves.png")
    save_confusion_matrix(y_true, y_pred, config.classes, output_dir / "confusion_matrix.png")
    class_report = save_per_class_metrics(y_true, y_pred, config.classes, output_dir / "classification_report")
    
    # Log to MLflow
    best = trainer.get_best_metrics()
    mlflow.log_metrics({**best, **test_metrics})
    for k in ["macro avg", "weighted avg"]:
        if k in class_report: mlflow.log_metric(f"{k.split()[0]}_f1", class_report[k]["f1-score"])

    model_path = trainer.save_model()
    mlflow.log_artifacts(str(output_dir))
    mlflow.end_run()

    logger.info(f"Training Complete. Best Val Acc: {best['best_val_accuracy']:.4f}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
