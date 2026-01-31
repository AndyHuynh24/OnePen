#!/usr/bin/env python3
"""Test training with real data to find the freeze point."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import json
import numpy as np

print("[1] Importing tensorflow...", flush=True)
import tensorflow as tf
print(f"[1] TensorFlow: {tf.__version__}", flush=True)

print("[2] Loading real data...", flush=True)
processed_dir = Path(__file__).parent.parent / "data" / "processed"
processed_file = processed_dir / "processed_data.npz"

if not processed_file.exists():
    files = sorted(processed_dir.glob("processed_data_*.npz"),
                   key=lambda p: p.stat().st_mtime, reverse=True)
    if files:
        processed_file = files[0]
    else:
        print("ERROR: No processed data found!", flush=True)
        sys.exit(1)

print(f"[2] Loading from: {processed_file}", flush=True)
data = np.load(processed_file)
images = data["images"]
features = data["features"]
labels = data["labels"]

print(f"[2] Loaded:", flush=True)
print(f"    images: {images.shape}, dtype={images.dtype}", flush=True)
print(f"    features: {features.shape}, dtype={features.dtype}", flush=True)
print(f"    labels: {labels.shape}, dtype={labels.dtype}", flush=True)
print(f"    unique labels: {np.unique(labels)}", flush=True)

# Check for NaN/Inf
print(f"[2] NaN check - images: {np.isnan(images).any()}, features: {np.isnan(features).any()}", flush=True)
print(f"[2] Inf check - images: {np.isinf(images).any()}, features: {np.isinf(features).any()}", flush=True)
print(f"[2] Image range: [{images.min():.3f}, {images.max():.3f}]", flush=True)
print(f"[2] Feature range: [{features.min():.3f}, {features.max():.3f}]", flush=True)

print("[3] Preparing small subset (50 samples)...", flush=True)
n = min(50, len(labels))
images_sub = images[:n].astype(np.float32)
features_sub = features[:n].astype(np.float32)
labels_sub = labels[:n]

# Normalize if needed
if images_sub.max() > 1.0:
    print("[3] Normalizing images to [0,1]...", flush=True)
    images_sub = images_sub / 255.0

x_train = {"img_input": images_sub[:40], "feature_input": features_sub[:40]}
y_train = labels_sub[:40]
x_val = {"img_input": images_sub[40:], "feature_input": features_sub[40:]}
y_val = labels_sub[40:]

print(f"[3] Train: {len(y_train)}, Val: {len(y_val)}", flush=True)

print("[4] Building model with MobileNetV3Small...", flush=True)
img_shape = images_sub.shape[1:]  # (H, W, C)
feat_dim = features_sub.shape[1]
n_classes = len(np.unique(labels))

print(f"[4] img_shape={img_shape}, feat_dim={feat_dim}, n_classes={n_classes}", flush=True)

# Build model
img_input = tf.keras.Input(shape=img_shape, name="img_input")
feat_input = tf.keras.Input(shape=(feat_dim,), name="feature_input")

base = tf.keras.applications.MobileNetV3Small(
    include_top=False,
    input_tensor=img_input,
    weights="imagenet",
)
base.trainable = False

x = base.output
x = tf.keras.layers.GlobalAveragePooling2D()(x)
f = tf.keras.layers.Dense(64, activation="relu")(feat_input)
combined = tf.keras.layers.Concatenate()([x, f])
combined = tf.keras.layers.Dense(128, activation="relu")(combined)
output = tf.keras.layers.Dense(n_classes, activation="softmax")(combined)

model = tf.keras.Model(inputs=[img_input, feat_input], outputs=output)
model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-4),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"]
)
print(f"[4] Model built, params: {model.count_params():,}", flush=True)

print("[5] Forward pass test...", flush=True)
test_x = {"img_input": images_sub[:1], "feature_input": features_sub[:1]}
pred = model(test_x, training=False)
print(f"[5] OK: {pred.shape}, sum={pred.numpy().sum():.4f}", flush=True)

print("[6] Starting model.fit() - 3 epochs, batch_size=8...", flush=True)
print("=" * 50, flush=True)

history = model.fit(
    x_train,
    y_train,
    validation_data=(x_val, y_val),
    epochs=3,
    batch_size=8,
    verbose=1,
)

print("=" * 50, flush=True)
print("[7] SUCCESS! Training with real data works.", flush=True)
print(f"[7] Final accuracy: {history.history['accuracy'][-1]:.4f}", flush=True)
