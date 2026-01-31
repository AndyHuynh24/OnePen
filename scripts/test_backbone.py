#!/usr/bin/env python3
"""Test if MobileNetV3 backbone causes the freeze."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import numpy as np

print("[1] Importing tensorflow...", flush=True)
import tensorflow as tf
print(f"[1] TensorFlow: {tf.__version__}", flush=True)

print("[2] Loading MobileNetV3Small with imagenet weights...", flush=True)
print("    (This may download weights on first run)", flush=True)

base = tf.keras.applications.MobileNetV3Small(
    include_top=False,
    input_shape=(136, 136, 3),
    weights="imagenet",
)
print(f"[2] MobileNetV3Small loaded, params: {base.count_params()}", flush=True)

print("[3] Building full model...", flush=True)
img_input = tf.keras.Input(shape=(136, 136, 3), name="img_input")
feat_input = tf.keras.Input(shape=(12,), name="feature_input")

# Image branch with pretrained backbone
x = base(img_input)
x = tf.keras.layers.GlobalAveragePooling2D()(x)

# Feature branch
f = tf.keras.layers.Dense(32, activation="relu")(feat_input)

# Fusion
combined = tf.keras.layers.Concatenate()([x, f])
combined = tf.keras.layers.Dense(64, activation="relu")(combined)
output = tf.keras.layers.Dense(10, activation="softmax")(combined)

model = tf.keras.Model(inputs=[img_input, feat_input], outputs=output)
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])
print(f"[3] Full model built, params: {model.count_params()}", flush=True)

print("[4] Creating dummy data...", flush=True)
n = 50
images = np.random.rand(n, 136, 136, 3).astype(np.float32)
features = np.random.rand(n, 12).astype(np.float32)
labels = np.random.randint(0, 10, n)

x_train = {"img_input": images[:40], "feature_input": features[:40]}
y_train = labels[:40]
x_val = {"img_input": images[40:], "feature_input": features[40:]}
y_val = labels[40:]
print("[4] Data ready", flush=True)

print("[5] Testing forward pass...", flush=True)
pred = model({"img_input": images[:1], "feature_input": features[:1]})
print(f"[5] Forward pass OK: {pred.shape}", flush=True)

print("[6] Starting training (2 epochs, batch_size=8)...", flush=True)
print("=" * 50, flush=True)

history = model.fit(
    x_train,
    y_train,
    validation_data=(x_val, y_val),
    epochs=2,
    batch_size=8,
    verbose=1,
)

print("=" * 50, flush=True)
print("[7] SUCCESS! Training completed.", flush=True)
