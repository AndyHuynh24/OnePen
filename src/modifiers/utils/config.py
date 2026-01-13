"""Configuration management with Pydantic validation."""

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, field_validator


class ProjectConfig(BaseModel):
    """Project metadata configuration."""
    name: str
    version: str
    description: str


class DataConfig(BaseModel):
    """Data paths and split configuration."""
    # raw_data_paths: list[str]
    # processed_path: str
    # augmented_path: str
    test_size: float = Field(ge=0, le=1)
    val_size: float = Field(ge=0, le=1)
    random_state: int = 42


class AugmentationConfig(BaseModel):
    """Data augmentation configuration."""
    enabled: bool = True
    num_augmentations: int = 6
    rotation_range: tuple[float, float] = (-6, 6)
    shear_x_range: tuple[float, float] = (-0.2, 0.2)
    shear_y_range: tuple[float, float] = (-0.1, 0.1)
    scale_x_range: tuple[float, float] = (0.9, 1.1)
    scale_y_range: tuple[float, float] = (0.9, 1.1)
    flip_horizontal: bool = True
    flip_exclude_types: list[str] = []
    rotation_exclude_types: list[str] = []

    @field_validator("rotation_range", "shear_x_range", "shear_y_range",
                     "scale_x_range", "scale_y_range", mode="before")
    @classmethod
    def convert_to_tuple(cls, v: Any) -> tuple[float, float]:
        if isinstance(v, list) and len(v) == 2:
            return tuple(v)
        return v


class FeatureConfig(BaseModel):
    """Feature engineering configuration."""
    image_size: int = 136
    line_width: int = 3
    num_features: int = 12
    antialiasing: bool = True
    height_threshold: float = 45
    cap_value: float = 100
    selected_indices: list[int] = [2, 3, 5, 8, 9, 11]

    @field_validator("selected_indices", mode="before")
    @classmethod
    def convert_indices(cls, v: Any) -> list[int]:
        if isinstance(v, list):
            return [int(i) for i in v]
        return v


class ModelArchConfig(BaseModel):
    """Model architecture configuration."""
    name: str = "mobilenetv3_hybrid_v2"
    backbone: str = "MobileNetV3Small"
    backbone_trainable: bool = False
    input_shape: tuple[int, int, int] = (136, 136, 3)
    num_classes: int = 10
    feature_dim: int = 10
    use_se_attention: bool = True
    fusion_units: list[int] = [384, 192]
    dropout_rates: dict[str, Any] = {}

    @field_validator("input_shape", mode="before")
    @classmethod
    def convert_input_shape(cls, v: Any) -> tuple[int, int, int]:
        if isinstance(v, list) and len(v) == 3:
            return tuple(v)
        return v


class EarlyStoppingConfig(BaseModel):
    """Early stopping callback configuration."""
    enabled: bool = True
    patience: int = 35
    monitor: str = "val_accuracy"
    restore_best_weights: bool = True


class ReduceLRConfig(BaseModel):
    """Learning rate reduction callback configuration."""
    enabled: bool = True
    factor: float = 0.5
    patience: int = 5
    min_lr: float = 1e-6


class TrainingConfig(BaseModel):
    """Training configuration."""
    epochs: int = 200
    batch_size: int = 32
    learning_rate: float = 0.0002
    early_stopping: EarlyStoppingConfig = EarlyStoppingConfig()
    reduce_lr: ReduceLRConfig = ReduceLRConfig()
    use_class_weights: bool = True


class ExportConfig(BaseModel):
    """Model export configuration."""
    keras_path: str = "models/keras"
    tfjs_path: str = "models/tfjs"
    tflite_path: str = "models/tflite"
    tfjs_quantization: bool = False
    tfjs_weight_shard_size: int = 4194304


class MLflowConfig(BaseModel):
    """MLflow tracking configuration."""
    tracking_uri: str = "mlruns"
    experiment_name: str = "onepen-stroke-classifier"
    log_models: bool = True
    log_artifacts: bool = True


class LoggingConfig(BaseModel):
    """Logging configuration."""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file: str = "logs/training.log"


class Config(BaseModel):
    """Root configuration object."""
    project: ProjectConfig
    classes: list[str]
    data: DataConfig
    augmentation: AugmentationConfig
    features: FeatureConfig
    model: ModelArchConfig
    training: TrainingConfig
    export: ExportConfig
    mlflow: MLflowConfig
    logging: LoggingConfig

    @property
    def num_classes(self) -> int:
        """Get number of classes from class list."""
        return len(self.classes)

    @property
    def class_to_idx(self) -> dict[str, int]:
        """Get class name to index mapping."""
        return {name: idx for idx, name in enumerate(self.classes)}

    @property
    def idx_to_class(self) -> dict[int, str]:
        """Get index to class name mapping."""
        return {idx: name for idx, name in enumerate(self.classes)}


def load_config(config_path: str | Path) -> Config:
    """Load and validate configuration from YAML file.

    Args:
        config_path: Path to the YAML configuration file.

    Returns:
        Validated Config object.
    """
    config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, "r") as f:
        raw_config = yaml.safe_load(f)

    return Config(**raw_config)


def save_config(config: Config, output_path: str | Path) -> None:
    """Save configuration to YAML file.

    Args:
        config: Configuration object to save.
        output_path: Path to save the YAML file.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w") as f:
        yaml.dump(config.model_dump(), f, default_flow_style=False, sort_keys=False)
