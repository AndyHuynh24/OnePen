"""Pytest fixtures for OnePen tests."""

import pytest
import tempfile
import os


@pytest.fixture
def sample_stroke():
    """Sample stroke data for testing."""
    return [
        {"x": 100, "y": 200, "p": 0.5},
        {"x": 150, "y": 250, "p": 0.7},
        {"x": 200, "y": 200, "p": 0.6},
        {"x": 250, "y": 150, "p": 0.8},
    ]


@pytest.fixture
def sample_stroke_minimal():
    """Minimal stroke with only x, y coordinates."""
    return [
        {"x": 0, "y": 0},
        {"x": 100, "y": 100},
    ]


@pytest.fixture
def sample_dataset():
    """Sample dataset for testing preprocessing."""
    return [
        {
            "type": "box",
            "stroke": [
                {"x": 10, "y": 10, "p": 0.5},
                {"x": 100, "y": 10, "p": 0.6},
                {"x": 100, "y": 100, "p": 0.7},
                {"x": 10, "y": 100, "p": 0.6},
                {"x": 10, "y": 10, "p": 0.5},
            ]
        },
        {
            "type": "underline",
            "stroke": [
                {"x": 0, "y": 50, "p": 0.5},
                {"x": 50, "y": 50, "p": 0.6},
                {"x": 100, "y": 50, "p": 0.7},
                {"x": 150, "y": 50, "p": 0.6},
            ]
        },
        {
            "type": "curly",
            "stroke": [
                {"x": 200, "y": 0, "p": 0.5},
                {"x": 180, "y": 50, "p": 0.6},
                {"x": 200, "y": 100, "p": 0.7},
            ]
        },
    ]


@pytest.fixture
def sample_config_dict():
    """Sample configuration dictionary."""
    return {
        "project": {
            "name": "test-project",
            "version": "1.0.0",
            "description": "Test project"
        },
        "classes": ["underline", "box", "curly", "delete", "none"],
        "data": {
            "test_size": 0.1,
            "val_size": 0.15,
            "random_state": 42
        },
        "augmentation": {
            "enabled": True,
            "num_augmentations": 3,
            "rotation_range": [-5, 5],
            "shear_x_range": [-0.1, 0.1],
            "shear_y_range": [-0.1, 0.1],
            "scale_x_range": [0.9, 1.1],
            "scale_y_range": [0.9, 1.1],
            "flip_horizontal": True,
            "flip_exclude_types": [],
            "rotation_exclude_types": []
        },
        "features": {
            "image_size": 96,
            "line_width": 3,
            "num_features": 12,
            "antialiasing": False,
            "height_threshold": 45,
            "cap_value": 100,
            "selected_indices": [2, 3, 5, 8, 9, 11]
        },
        "model": {
            "name": "test-model",
            "backbone": "mobilenetv3_small",
            "backbone_trainable": False,
            "input_shape": [96, 96, 3],
            "num_classes": 5,
            "feature_dim": 12,
            "use_se_attention": True,
            "fusion_units": [256, 128],
            "dropout_rates": {"backbone": 0.2}
        },
        "training": {
            "epochs": 10,
            "batch_size": 16,
            "learning_rate": 0.001,
            "early_stopping": {
                "enabled": True,
                "patience": 5,
                "monitor": "val_accuracy",
                "restore_best_weights": True
            },
            "reduce_lr": {
                "enabled": True,
                "factor": 0.5,
                "patience": 3,
                "min_lr": 1e-6
            },
            "use_class_weights": True
        },
        "export": {
            "keras_path": "models/keras",
            "tfjs_path": "models/tfjs",
            "tflite_path": "models/tflite",
            "tfjs_quantization": False,
            "tfjs_weight_shard_size": 4194304
        },
        "wandb": {
            "enabled": False,
            "project": "test-experiment",
            "entity": None,
            "log_model": False
        },
        "logging": {
            "level": "INFO",
            "format": "%(message)s",
            "file": "logs/test.log"
        }
    }


@pytest.fixture
def temp_config_file(sample_config_dict):
    """Create a temporary config file for testing."""
    import yaml

    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        yaml.dump(sample_config_dict, f)
        temp_path = f.name

    yield temp_path

    # Cleanup
    os.unlink(temp_path)
