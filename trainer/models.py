"""
Model zoo for the OnePen stroke classifier — a small set of architectures sharing
one training harness so they can be compared head-to-head.

  geometric   baseline — MLP on the 12 geometric features only
  image       baseline — MobileNetV3-Small CNN on the 96x96 raster only
  hybrid      image ⊕ geometric  (this is the model the browser app deploys)
  tcn         Temporal ConvNet on the raw stroke sequence  (the strongest)
  tcn_hybrid  tcn ⊕ geometric    (tcn with the hand-crafted features bolted on)

Every builder returns (model, input_keys). `input_keys` tells the harness which
of {img_input, feature_input, seq_input} to feed. Input layers are named so the
hybrid exports to the exact TF.js contract the app already expects
(img_input / feature_input → output_0, 8 classes).
"""

from __future__ import annotations

import tensorflow as tf
from tensorflow.keras import Model, layers
from tensorflow.keras.applications import MobileNetV3Small

from data import FEATURE_DIM, IMG_SIZE, SEQ_CHANNELS, SEQ_LEN

NUM_CLASSES = 8


def _compile(model: Model, lr: float) -> Model:
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=lr),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def _softmax_head(x, num_classes: int):
    # float32 output keeps mixed-precision training numerically stable
    return layers.Dense(num_classes, activation="softmax", dtype="float32", name="classifier")(x)


# ── image branch (shared by image / hybrid) ──────────────────────────────────
def _image_branch(img_input, trainable: bool):
    base = MobileNetV3Small(include_top=False, input_tensor=img_input,
                            weights="imagenet", minimalistic=False)
    base.trainable = trainable
    x = base.output
    ch = x.shape[-1]
    se = layers.GlobalAveragePooling2D()(x)
    se = layers.Dense(ch // 8, activation="relu")(se)
    se = layers.Dense(ch, activation="sigmoid")(se)
    x = layers.Multiply()([x, layers.Reshape((1, 1, ch))(se)])
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    return layers.Dropout(0.25)(x)


# ── geometric branch (shared by geometric / hybrid / tcn_hybrid) ─────────────
def _geometric_branch(feat_input):
    f = layers.Dense(128, activation="relu")(feat_input)
    f = layers.LayerNormalization()(f)
    f = layers.Dropout(0.25)(f)
    f = layers.Dense(64, activation="relu")(f)
    f = layers.LayerNormalization()(f)
    return layers.Dropout(0.2)(f)


# ── temporal-convolution branch (shared by tcn / tcn_hybrid) ─────────────────
def _tcn_block(x, filters: int, dilation: int, dropout: float = 0.1):
    prev = x
    for _ in range(2):
        x = layers.Conv1D(filters, 3, padding="causal", dilation_rate=dilation)(x)
        x = layers.LayerNormalization()(x)
        x = layers.Activation("relu")(x)
        x = layers.SpatialDropout1D(dropout)(x)
    if prev.shape[-1] != filters:
        prev = layers.Conv1D(filters, 1, padding="same")(prev)
    return layers.Add()([prev, x])


def _tcn_branch(seq_input, filters: int = 64):
    x = seq_input
    for d in (1, 2, 4, 8, 16):
        x = _tcn_block(x, filters, d)
    return layers.GlobalAveragePooling1D()(x)


# ── builders ─────────────────────────────────────────────────────────────────
def build_geometric(num_classes=NUM_CLASSES, lr=1e-3, **_):
    inp = layers.Input(shape=(FEATURE_DIM,), name="feature_input")
    out = _softmax_head(_geometric_branch(inp), num_classes)
    return _compile(Model(inp, out, name="geometric_only"), lr), ["feature_input"]


def build_image(num_classes=NUM_CLASSES, lr=2e-4, backbone_trainable=False, **_):
    inp = layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3), name="img_input")
    x = _image_branch(inp, backbone_trainable)
    for i, u in enumerate((256, 128)):
        x = layers.Dense(u, activation="relu")(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.35 if i == 0 else 0.25)(x)
    return _compile(Model(inp, _softmax_head(x, num_classes), name="image_only"), lr), ["img_input"]


def build_hybrid(num_classes=NUM_CLASSES, lr=2e-4, backbone_trainable=False, **_):
    img_input = layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3), name="img_input")
    feat_input = layers.Input(shape=(FEATURE_DIM,), name="feature_input")
    z = layers.Concatenate()([_image_branch(img_input, backbone_trainable), _geometric_branch(feat_input)])
    for i, u in enumerate((384, 192)):
        z = layers.Dense(u, activation="relu")(z)
        z = layers.BatchNormalization()(z)
        z = layers.Dropout(0.35 if i == 0 else 0.25)(z)
    model = Model([img_input, feat_input], _softmax_head(z, num_classes), name="hybrid")
    return _compile(model, lr), ["img_input", "feature_input"]


def build_tcn(num_classes=NUM_CLASSES, lr=1e-3, **_):
    inp = layers.Input(shape=(SEQ_LEN, SEQ_CHANNELS), name="seq_input")
    x = _tcn_branch(inp)
    x = layers.Dense(64, activation="relu")(x)
    x = layers.Dropout(0.3)(x)
    return _compile(Model(inp, _softmax_head(x, num_classes), name="tcn"), lr), ["seq_input"]


def build_tcn_hybrid(num_classes=NUM_CLASSES, lr=1e-3, **_):
    seq_input = layers.Input(shape=(SEQ_LEN, SEQ_CHANNELS), name="seq_input")
    feat_input = layers.Input(shape=(FEATURE_DIM,), name="feature_input")
    z = layers.Concatenate()([_tcn_branch(seq_input), _geometric_branch(feat_input)])
    z = layers.Dense(96, activation="relu")(z)
    z = layers.Dropout(0.3)(z)
    model = Model([seq_input, feat_input], _softmax_head(z, num_classes), name="tcn_hybrid")
    return _compile(model, lr), ["seq_input", "feature_input"]


# name → (builder, supports_finetune)
MODELS = {
    "geometric": (build_geometric, False),
    "image": (build_image, True),
    "hybrid": (build_hybrid, True),
    "tcn": (build_tcn, False),
    "tcn_hybrid": (build_tcn_hybrid, False),
}

# roles for the comparison report
BASELINES = ["geometric", "image"]
# `hybrid` is what the app deploys; `tcn`/`tcn_hybrid` are the candidate upgrades.
APP_MODEL = "hybrid"
