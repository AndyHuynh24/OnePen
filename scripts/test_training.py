#!/usr/bin/env python3
"""Minimal test script to debug training freeze."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import numpy as np

print("[1] Importing tensorflow...", flush=True)
import tensorflow as tf
print(f"[1] TensorFlow version: {tf.__version__}", flush=True)
print(f"[1] Keras version: {tf.keras.__version__}", flush=True)

print("[2] Creating dummy data...", flush=True)
# Small dummy dataset
n_samples = 100
img_size = 136
n_features = 12
n_classes = 10

images = np.random.rand(n_samples, img_size, img_size, 3).astype(np.float32)
features = np.random.rand(n_samples, n_features).astype(np.float32)
labels = np.random.randint(0, n_classes, n_samples)

x_train = {"img_input": images[:80], "feature_input": features[:80]}
y_train = labels[:80]
x_val = {"img_input": images[80:], "feature_input": features[80:]}
y_val = labels[80:]

print(f"[2] Data shapes: images={images.shape}, features={features.shape}", flush=True)

print("[3] Building simple model (no pretrained weights)...", flush=True)

# Simple model without pretrained backbone
img_input = tf.keras.Input(shape=(img_size, img_size, 3), name="img_input")
feat_input = tf.keras.Input(shape=(n_features,), name="feature_input")

# Simple CNN branch
x = tf.keras.layers.Conv2D(32, 3, activation="relu")(img_input)
x = tf.keras.layers.MaxPooling2D()(x)
x = tf.keras.layers.Conv2D(64, 3, activation="relu")(x)
x = tf.keras.layers.GlobalAveragePooling2D()(x)

# Feature branch
f = tf.keras.layers.Dense(32, activation="relu")(feat_input)

# Fusion
combined = tf.keras.layers.Concatenate()([x, f])
combined = tf.keras.layers.Dense(64, activation="relu")(combined)
output = tf.keras.layers.Dense(n_classes, activation="softmax")(combined)

model = tf.keras.Model(inputs=[img_input, feat_input], outputs=output)
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])

print(f"[3] Model built, params: {model.count_params()}", flush=True)

print("[4] Testing forward pass...", flush=True)
test_pred = model({"img_input": images[:1], "feature_input": features[:1]})
print(f"[4] Forward pass OK: {test_pred.shape}", flush=True)

print("[5] Starting model.fit() with 2 epochs...", flush=True)
print("=" * 50, flush=True)

history = model.fit(
    x_train,
    y_train,
    validation_data=(x_val, y_val),
    epochs=2,
    batch_size=16,
    verbose=1,
)

print("=" * 50, flush=True)
print("[6] Training complete!", flush=True)
print(f"[6] Final accuracy: {history.history['accuracy'][-1]:.4f}", flush=True)
