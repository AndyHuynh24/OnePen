#!/usr/bin/env python3
"""Test full pipeline step by step to find freeze point."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import json
import numpy as np

print("[1] Basic imports...", flush=True)
import tensorflow as tf
from tensorflow import keras
print(f"[1] TensorFlow: {tf.__version__}", flush=True)

print("[2] Importing project modules...", flush=True)
from modifiers.utils.config import load_config
from modifiers.utils.logging import setup_logging, get_logger
from modifiers.models.architecture import build_hybrid_model
from modifiers.models.trainer import StrokeModelTrainer
print("[2] All imports OK", flush=True)

print("[3] Loading config...", flush=True)
config = load_config(Path("config/config.yaml"))
setup_logging(config.logging.level, config.logging.file)
logger = get_logger("test")
print(f"[3] Config loaded: {config.num_classes} classes", flush=True)

print("[4] Loading full dataset...", flush=True)
processed_dir = Path("data/processed")
processed_file = processed_dir / "processed_data.npz"
if not processed_file.exists():
    files = sorted(processed_dir.glob("processed_data_*.npz"),
                   key=lambda p: p.stat().st_mtime, reverse=True)
    processed_file = files[0] if files else None

data = np.load(processed_file)
images = data["images"].astype(np.float32)
features = data["features"].astype(np.float32)
labels = data["labels"]

print(f"[4] Full data: {len(labels)} samples", flush=True)
print(f"[4] Images: {images.shape}, Features: {features.shape}", flush=True)

print("[5] Splitting data...", flush=True)
from sklearn.model_selection import train_test_split

indices = np.arange(len(labels))
train_val_idx, test_idx = train_test_split(
    indices, test_size=0.15, stratify=labels, random_state=42
)
train_idx, val_idx = train_test_split(
    train_val_idx, test_size=0.15, stratify=labels[train_val_idx], random_state=42
)
print(f"[5] Split: {len(train_idx)} train / {len(val_idx)} val / {len(test_idx)} test", flush=True)

print("[6] Preparing data dicts...", flush=True)
x_train = {"img_input": images[train_idx], "feature_input": features[train_idx]}
y_train = labels[train_idx]
x_val = {"img_input": images[val_idx], "feature_input": features[val_idx]}
y_val = labels[val_idx]
print(f"[6] x_train img shape: {x_train['img_input'].shape}", flush=True)
print(f"[6] Memory: ~{(images.nbytes + features.nbytes) / 1e9:.2f} GB", flush=True)

print("[7] Building model with build_hybrid_model()...", flush=True)
model = build_hybrid_model(
    input_shape=[config.features.image_size, config.features.image_size, 3],
    num_classes=config.num_classes,
    feature_dim=features.shape[1],
    learning_rate=config.training.learning_rate,
    backbone_trainable=False,
    use_se_attention=True,
    backbone="mobilenetv3_small",  # Use small for faster test
)
print(f"[7] Model built: {model.count_params():,} params", flush=True)

print("[8] Creating trainer...", flush=True)
trainer = StrokeModelTrainer(
    model=model,
    output_dir=Path("outputs/test_run"),
    experiment_name="test",
)
print("[8] Trainer created", flush=True)

print("[9] Computing class weights...", flush=True)
from sklearn.utils.class_weight import compute_class_weight
classes = np.unique(y_train)
weights = compute_class_weight("balanced", classes=classes, y=y_train)
class_weights = dict(zip(classes.astype(int), weights))
print(f"[9] Class weights: {class_weights}", flush=True)

print("[10] Starting trainer.train() - 3 epochs...", flush=True)
print("=" * 60, flush=True)

history = trainer.train(
    x_train=x_train,
    y_train=y_train,
    x_val=x_val,
    y_val=y_val,
    epochs=3,
    batch_size=config.training.batch_size,
    class_weights=class_weights,
    early_stopping_patience=35,
    reduce_lr_patience=5,
    use_tensorboard=False,
)

print("=" * 60, flush=True)
print("[11] SUCCESS! Full pipeline works.", flush=True)
