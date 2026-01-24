"""Tests for configuration module."""

import pytest
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from modifiers.utils.config import (
    Config,
    ProjectConfig,
    DataConfig,
    AugmentationConfig,
    FeatureConfig,
    ModelArchConfig,
    TrainingConfig,
    load_config,
)


class TestProjectConfig:
    """Tests for ProjectConfig."""

    def test_valid_config(self):
        """Test valid project configuration."""
        config = ProjectConfig(
            name="test-project",
            version="1.0.0",
            description="A test project"
        )

        assert config.name == "test-project"
        assert config.version == "1.0.0"
        assert config.description == "A test project"


class TestDataConfig:
    """Tests for DataConfig."""

    def test_valid_splits(self):
        """Test valid data split configuration."""
        config = DataConfig(test_size=0.1, val_size=0.2, random_state=42)

        assert config.test_size == 0.1
        assert config.val_size == 0.2
        assert config.random_state == 42

    def test_invalid_test_size(self):
        """Test that invalid test_size raises error."""
        with pytest.raises(ValueError):
            DataConfig(test_size=1.5, val_size=0.2)

    def test_invalid_val_size(self):
        """Test that invalid val_size raises error."""
        with pytest.raises(ValueError):
            DataConfig(test_size=0.1, val_size=-0.1)


class TestAugmentationConfig:
    """Tests for AugmentationConfig."""

    def test_default_values(self):
        """Test default augmentation values."""
        config = AugmentationConfig()

        assert config.enabled is True
        assert config.num_augmentations == 6
        assert config.flip_horizontal is True

    def test_tuple_conversion(self):
        """Test that list values are converted to tuples."""
        config = AugmentationConfig(
            rotation_range=[-10, 10],
            shear_x_range=[-0.2, 0.2]
        )

        assert config.rotation_range == (-10, 10)
        assert config.shear_x_range == (-0.2, 0.2)


class TestFeatureConfig:
    """Tests for FeatureConfig."""

    def test_default_values(self):
        """Test default feature configuration."""
        config = FeatureConfig()

        assert config.image_size == 136
        assert config.line_width == 3
        assert config.num_features == 12

    def test_selected_indices_conversion(self):
        """Test that selected_indices are converted to int."""
        config = FeatureConfig(selected_indices=[1.0, 2.0, 3.0])

        assert config.selected_indices == [1, 2, 3]
        assert all(isinstance(i, int) for i in config.selected_indices)


class TestModelArchConfig:
    """Tests for ModelArchConfig."""

    def test_default_values(self):
        """Test default model architecture configuration."""
        config = ModelArchConfig()

        assert config.name == "mobilenetv3_hybrid_v2"
        assert config.backbone == "MobileNetV3Small"
        assert config.backbone_trainable is False

    def test_input_shape_conversion(self):
        """Test that input_shape is converted to tuple."""
        config = ModelArchConfig(input_shape=[96, 96, 3])

        assert config.input_shape == (96, 96, 3)
        assert isinstance(config.input_shape, tuple)


class TestTrainingConfig:
    """Tests for TrainingConfig."""

    def test_default_values(self):
        """Test default training configuration."""
        config = TrainingConfig()

        assert config.epochs == 200
        assert config.batch_size == 32
        assert config.learning_rate == 0.0002
        assert config.use_class_weights is True

    def test_early_stopping_defaults(self):
        """Test early stopping default configuration."""
        config = TrainingConfig()

        assert config.early_stopping.enabled is True
        assert config.early_stopping.patience == 35
        assert config.early_stopping.monitor == "val_accuracy"


class TestConfig:
    """Tests for root Config class."""

    def test_num_classes_property(self, sample_config_dict):
        """Test num_classes property."""
        config = Config(**sample_config_dict)

        assert config.num_classes == 5

    def test_class_to_idx_property(self, sample_config_dict):
        """Test class_to_idx property."""
        config = Config(**sample_config_dict)
        mapping = config.class_to_idx

        assert mapping["underline"] == 0
        assert mapping["box"] == 1
        assert mapping["curly"] == 2
        assert mapping["delete"] == 3
        assert mapping["none"] == 4

    def test_idx_to_class_property(self, sample_config_dict):
        """Test idx_to_class property."""
        config = Config(**sample_config_dict)
        mapping = config.idx_to_class

        assert mapping[0] == "underline"
        assert mapping[1] == "box"
        assert mapping[4] == "none"


class TestLoadConfig:
    """Tests for load_config function."""

    def test_load_valid_config(self, temp_config_file):
        """Test loading a valid config file."""
        config = load_config(temp_config_file)

        assert config.project.name == "test-project"
        assert config.num_classes == 5
        assert config.training.epochs == 10

    def test_load_nonexistent_file(self):
        """Test that loading nonexistent file raises error."""
        with pytest.raises(FileNotFoundError):
            load_config("nonexistent_config.yaml")

    def test_config_classes_match(self, temp_config_file):
        """Test that loaded classes match expected."""
        config = load_config(temp_config_file)

        expected_classes = ["underline", "box", "curly", "delete", "none"]
        assert config.classes == expected_classes
