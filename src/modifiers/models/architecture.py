"""Hybrid CNN + Feature model for stroke classification."""

import tensorflow as tf
from tensorflow.keras.applications import MobileNetV3Large, MobileNetV3Small, EfficientNetV2B0
from tensorflow.keras.layers import (
    Input,
    Dense,
    Dropout,
    BatchNormalization,
    GlobalAveragePooling2D,
    Concatenate,
    LayerNormalization,
    Multiply,
    Reshape,
    Conv2D,
    MaxPooling2D,
)
from tensorflow.keras.models import Model
from tensorflow.keras.optimizers import Adam

from modifiers.utils.logging import get_logger

logger = get_logger("onepen.models")

SUPPORTED_BACKBONES = ["mobilenetv3_large", "mobilenetv3_small", "efficientnetv2"]

def _build_backbone(
    input_tensor: tf.Tensor,
    backbone: str,
    trainable: bool = False,
) -> tf.Tensor:
    """Build the specified backbone and return its output tensor."""

    if backbone == "mobilenetv3_large":
        base = MobileNetV3Large(
            include_top=False,
            input_tensor=input_tensor,
            weights="imagenet",
            minimalistic=False,
        )
        base.trainable = trainable
        return base.output

    elif backbone == "mobilenetv3_small":
        base = MobileNetV3Small(
            include_top=False,
            input_tensor=input_tensor,
            weights="imagenet",
            minimalistic=False,
        )
        base.trainable = trainable
        return base.output

    elif backbone == "efficientnetv2":
        base = EfficientNetV2B0(
            include_top=False,
            input_tensor=input_tensor,
            weights="imagenet",
        )
        base.trainable = trainable
        return base.output

    else:
        raise ValueError(f"Unknown backbone: {backbone}. Supported: {SUPPORTED_BACKBONES}")


def build_hybrid_model(
    input_shape: tuple[int, int, int] = (136, 136, 3),
    num_classes: int = 10,
    feature_dim: int = 10,
    learning_rate: float = 2e-4,
    backbone_trainable: bool = False,
    use_se_attention: bool = True,
    fusion_units: list[int] | None = None,
    backbone: str = "mobilenetv3_large",
) -> Model:
    """Build hybrid CNN + geometric features model.

    Args:
        input_shape: Shape of input images (H, W, C).
        num_classes: Number of output classes.
        feature_dim: Dimension of geometric feature input.
        learning_rate: Learning rate for Adam optimizer.
        backbone_trainable: Whether to train the backbone.
        use_se_attention: Whether to use Squeeze-and-Excitation attention.
        fusion_units: Hidden units for fusion layers
        backbone: Which backbone to use. Options:
            - "mobilenetv3_large": MobileNetV3Large (default, ~5MB)
            - "mobilenetv3_small": MobileNetV3Small (~2.5MB)
            - "efficientnetv2": EfficientNetV2B0 (~7MB)
            - "custom_cnn": Lightweight custom CNN (~1MB)

    Returns:
        Compiled Keras Model.
    """
    if fusion_units is None:
        fusion_units = [384, 192]

    # ========== Image Branch ==========
    img_input = Input(shape=input_shape, name="img_input")

    x = _build_backbone(img_input, backbone, backbone_trainable)

    #Squeeze-and-Excitation attention
    if use_se_attention:
        channels = x.shape[-1]
        se = GlobalAveragePooling2D()(x)
        se = Dense(channels // 8, activation="relu")(se)
        se = Dense(channels, activation="sigmoid")(se)
        se = Reshape((1, 1, channels))(se)
        x = Multiply()([x, se])

    x = GlobalAveragePooling2D()(x)
    x = BatchNormalization()(x)
    x = Dropout(0.25)(x)

    # ========== Feature Branch ==========
    feat_input = Input(shape=(feature_dim,), name="feature_input")

    f = Dense(128, activation="relu")(feat_input)
    f = LayerNormalization()(f)
    f = Dropout(0.25)(f)

    f = Dense(64, activation="relu")(f)
    f = LayerNormalization()(f)
    f = Dropout(0.2)(f)

    # ========== Fusion ==========
    combined = Concatenate()([x, f])

    for i, units in enumerate(fusion_units):
        combined = Dense(units, activation="relu")(combined)
        combined = BatchNormalization()(combined)
        dropout_rate = 0.35 if i == 0 else 0.25
        combined = Dropout(dropout_rate)(combined)

    # ========== Output ==========
    output = Dense(num_classes, activation="softmax", name="classifier")(combined)

    # ========== Build Model ==========
    model = Model(
        inputs=[img_input, feat_input],
        outputs=output,
        name=f"hybrid_{backbone}",
    )

    # ========== Compile ==========
    model.compile(
        optimizer=Adam(learning_rate=learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    logger.info(f"Built hybrid model with backbone: {backbone}")
    logger.info(f"  Image input: {input_shape}")
    logger.info(f"  Feature input: {feature_dim}D")
    logger.info(f"  Output classes: {num_classes}")
    logger.info(f"  Backbone trainable: {backbone_trainable}")
    logger.info(f"  Total params: {model.count_params():,}")

    return model


class HybridStrokeClassifier:
    """Wrapper class for the hybrid stroke classifier."""

    def __init__(
        self,
        input_shape: tuple[int, int, int] = (136, 136, 3),
        num_classes: int = 10,
        feature_dim: int = 10,
        learning_rate: float = 2e-4,
        backbone_trainable: bool = False,
        use_se_attention: bool = True,
        fusion_units: list[int] | None = None,
        backbone: str = "mobilenetv3_large",
    ):
        self.input_shape = input_shape
        self.num_classes = num_classes
        self.feature_dim = feature_dim
        self.learning_rate = learning_rate
        self.backbone_trainable = backbone_trainable
        self.use_se_attention = use_se_attention
        self.fusion_units = fusion_units
        self.backbone = backbone
        self.model: Model | None = None

    def build(self) -> Model:
        """Build and return the model."""
        self.model = build_hybrid_model(
            input_shape=self.input_shape,
            num_classes=self.num_classes,
            feature_dim=self.feature_dim,
            learning_rate=self.learning_rate,
            backbone_trainable=self.backbone_trainable,
            use_se_attention=self.use_se_attention,
            fusion_units=self.fusion_units,
            backbone=self.backbone,
        )
        return self.model

    def summary(self) -> None:
        """Print model summary."""
        if self.model is None:
            self.build()
        self.model.summary()

    def save(self, path: str) -> None:
        """Save model to file."""
        if self.model is None:
            raise ValueError("Model not built yet")
        self.model.save(path)
        logger.info(f"Model saved to {path}")

    def load(self, path: str) -> Model:
        """Load model from file."""
        self.model = tf.keras.models.load_model(path)
        logger.info(f"Model loaded from {path}")
        return self.model

    def __repr__(self) -> str:
        return (
            f"HybridStrokeClassifier(backbone={self.backbone}, "
            f"num_classes={self.num_classes})"
        )
