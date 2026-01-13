#!/usr/bin/env python3
"""Evaluate existing model and log to MLflow.

This script loads a trained model, evaluates it on train/val/test splits
(using the exact same split as training), and logs all metrics to MLflow.

Usage:
    python scripts/evaluate_and_log.py --model outputs/run_20260112_175257/checkpoints/best_model.keras
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import mlflow
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix, classification_report
import matplotlib.pyplot as plt
import seaborn as sns

from modifiers.utils.config import load_config


def split_data(images, labels, features, test_size, val_size, random_state):
    """Split data identically to training."""
    n_samples = len(labels)
    indices = np.arange(n_samples)
    
    idx_trainval, idx_test = train_test_split(
        indices, test_size=test_size, stratify=labels, random_state=random_state
    )
    idx_train, idx_val = train_test_split(
        idx_trainval, test_size=val_size, stratify=labels[idx_trainval], random_state=random_state
    )
    
    return {
        'X_train_img': images[idx_train], 'X_train_feat': features[idx_train], 'y_train': labels[idx_train],
        'X_val_img': images[idx_val], 'X_val_feat': features[idx_val], 'y_val': labels[idx_val],
        'X_test_img': images[idx_test], 'X_test_feat': features[idx_test], 'y_test': labels[idx_test],
    }


def evaluate_split(model, X_img, X_feat, y_true):
    """Evaluate model on a data split."""
    y_pred_probs = model.predict({'img_input': X_img, 'feature_input': X_feat}, verbose=0)
    y_pred = np.argmax(y_pred_probs, axis=1)
    y_true_int = y_true.astype(int)
    
    loss = tf.keras.losses.sparse_categorical_crossentropy(y_true_int, y_pred_probs).numpy().mean()
    accuracy = (y_pred == y_true_int).mean()
    
    return {'accuracy': accuracy, 'loss': float(loss), 'y_pred': y_pred}


def save_confusion_matrix(y_true, y_pred, class_names, output_path):
    """Save confusion matrix visualization."""
    cm = confusion_matrix(y_true, y_pred)
    cm_norm = cm.astype('float') / cm.sum(axis=1)[:, np.newaxis]
    
    plt.figure(figsize=(12, 10))
    sns.heatmap(cm_norm, annot=True, fmt='.2%', cmap='Blues',
                xticklabels=class_names, yticklabels=class_names, square=True)
    plt.title('Confusion Matrix (Normalized)')
    plt.ylabel('True Label')
    plt.xlabel('Predicted Label')
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    return output_path


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate model and log to MLflow")
    parser.add_argument("--model", type=Path, required=True, help="Path to .keras model file")
    parser.add_argument("--config", type=Path, default=Path("config/config.yaml"))
    parser.add_argument("--run-name", type=str, default=None, help="MLflow run name")
    parser.add_argument("--output-dir", type=Path, default=None, help="Output dir for artifacts")
    return parser.parse_args()


def main():
    args = parse_args()
    config = load_config(args.config)
    
    print("=" * 60)
    print("Evaluate Model & Log to MLflow")
    print("=" * 60)
    
    # Load model
    print(f"\n[1/5] Loading model: {args.model}")
    model = tf.keras.models.load_model(str(args.model))
    
    # Load data
    print("[2/5] Loading processed data...")
    processed_dir = Path(__file__).parent.parent / "data" / "processed"
    data_file = processed_dir / "latest.npz"
    if not data_file.exists():
        data_file = sorted(processed_dir.glob("processed_data_*.npz"), key=lambda p: p.stat().st_mtime)[-1]
    
    data = np.load(data_file)
    images, features, labels = data['images'], data['features'], data['labels']
    print(f"  Loaded {len(labels)} samples")
    
    # Split data (same as training)
    print("[3/5] Splitting data (random_state=42)...")
    splits = split_data(images, labels, features, 
                        config.data.test_size, config.data.val_size, config.data.random_state)
    print(f"  Train: {len(splits['y_train'])}, Val: {len(splits['y_val'])}, Test: {len(splits['y_test'])}")
    
    # Evaluate on all splits
    print("[4/5] Evaluating on all splits...")
    train_result = evaluate_split(model, splits['X_train_img'], splits['X_train_feat'], splits['y_train'])
    val_result = evaluate_split(model, splits['X_val_img'], splits['X_val_feat'], splits['y_val'])
    test_result = evaluate_split(model, splits['X_test_img'], splits['X_test_feat'], splits['y_test'])
    
    print(f"  Train - Acc: {train_result['accuracy']:.4f}, Loss: {train_result['loss']:.4f}")
    print(f"  Val   - Acc: {val_result['accuracy']:.4f}, Loss: {val_result['loss']:.4f}")
    print(f"  Test  - Acc: {test_result['accuracy']:.4f}, Loss: {test_result['loss']:.4f}")
    
    # Setup output directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = args.output_dir or Path(f"outputs/eval_{timestamp}")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save confusion matrix
    cm_path = save_confusion_matrix(
        splits['y_test'].astype(int), test_result['y_pred'],
        config.classes, output_dir / "confusion_matrix.png"
    )
    
    # Save classification report
    report = classification_report(
        splits['y_test'].astype(int), test_result['y_pred'],
        target_names=config.classes, output_dict=True, zero_division=0
    )
    report_path = output_dir / "classification_report.json"
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    # Log to MLflow
    print("[5/5] Logging to MLflow...")
    tracking_uri = Path(config.mlflow.tracking_uri)
    if not tracking_uri.is_absolute():
        tracking_uri = Path(__file__).parent.parent / tracking_uri
    mlflow.set_tracking_uri(f"file:///{tracking_uri.resolve().as_posix()}")
    mlflow.set_experiment(config.mlflow.experiment_name)
    
    run_name = args.run_name or f"eval_{args.model.parent.parent.name}"
    
    with mlflow.start_run(run_name=run_name):
        # Log parameters
        mlflow.log_params({
            "model_name": config.model.name,
            "backbone": config.model.backbone,
            "num_classes": config.num_classes,
            "image_size": config.features.image_size,
            "learning_rate": config.training.learning_rate,
            "batch_size": config.training.batch_size,
            "epochs": config.training.epochs,
            "train_samples": len(splits['y_train']),
            "val_samples": len(splits['y_val']),
            "test_samples": len(splits['y_test']),
        })
        
        # Log metrics
        mlflow.log_metrics({
            "train_accuracy": train_result['accuracy'],
            "train_loss": train_result['loss'],
            "best_val_accuracy": val_result['accuracy'],  # Current val = best since model is loaded
            "best_val_loss": val_result['loss'],
            "test_accuracy": test_result['accuracy'],
            "test_loss": test_result['loss'],
            "macro_f1": report["macro avg"]["f1-score"],
            "weighted_f1": report["weighted avg"]["f1-score"],
        })
        
        # Log artifacts
        mlflow.log_artifact(str(cm_path))
        mlflow.log_artifact(str(report_path))
        mlflow.log_artifact(str(args.model), artifact_path="models")
        
        run_id = mlflow.active_run().info.run_id
    
    print("\n" + "=" * 60)
    print("✅ Complete!")
    print(f"   MLflow Run ID: {run_id}")
    print(f"   Test Accuracy: {test_result['accuracy']:.4f}")
    print("=" * 60)
    print("\nTo view: mlflow ui")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
