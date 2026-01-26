"""Tests for ML model loading and inference.

These tests are optional and will be skipped if TensorFlow is not available
or if model files are not present.
"""

import pytest
import numpy as np
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

# Check if TensorFlow is available
try:
    import tensorflow as tf
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

# Project paths
PROJECT_ROOT = Path(__file__).parent.parent
TFJS_MODEL_PATH = PROJECT_ROOT / "app" / "tfjs" / "model.json"
KERAS_MODEL_PATTERN = PROJECT_ROOT / "models" / "**" / "*.keras"


def find_keras_model():
    """Find any available Keras model file."""
    # Check common locations
    possible_paths = [
        PROJECT_ROOT / "models" / "best_model.keras",
        PROJECT_ROOT / "models" / "final_model.keras",
        PROJECT_ROOT / "models" / "keras" / "best_model.keras",
    ]

    for path in possible_paths:
        if path.exists():
            return path

    # Search in mlruns (if not gitignored locally)
    mlruns_models = list(PROJECT_ROOT.glob("mlruns/**/best_model.keras"))
    if mlruns_models:
        return mlruns_models[0]

    return None


# Skip markers
requires_tf = pytest.mark.skipif(
    not TF_AVAILABLE,
    reason="TensorFlow not installed"
)

requires_model = pytest.mark.skipif(
    not TF_AVAILABLE or find_keras_model() is None,
    reason="No Keras model file found"
)


@requires_tf
class TestTensorFlowAvailability:
    """Tests that verify TensorFlow is working."""

    def test_tensorflow_import(self):
        """Test that TensorFlow can be imported."""
        import tensorflow as tf
        assert tf is not None

    def test_tensorflow_version(self):
        """Test TensorFlow version is recent enough."""
        import tensorflow as tf
        version = tf.__version__
        major = int(version.split('.')[0])
        assert major >= 2, f"TensorFlow version {version} is too old"

    def test_basic_tensor_operations(self):
        """Test basic TensorFlow operations work."""
        import tensorflow as tf

        # Create a simple tensor
        x = tf.constant([[1, 2], [3, 4]])
        y = tf.constant([[5, 6], [7, 8]])
        z = tf.matmul(x, y)

        assert z.shape == (2, 2)


@requires_model
class TestModelLoading:
    """Tests for loading the trained model."""

    def test_load_keras_model(self):
        """Test loading a Keras model."""
        import tensorflow as tf

        model_path = find_keras_model()
        assert model_path is not None, "No model found"

        model = tf.keras.models.load_model(model_path)
        assert model is not None

    def test_model_has_expected_structure(self):
        """Test model has input and output layers."""
        import tensorflow as tf

        model_path = find_keras_model()
        model = tf.keras.models.load_model(model_path)

        # Should have at least one input
        assert len(model.inputs) >= 1

        # Should have one output
        assert len(model.outputs) == 1

    def test_model_output_shape(self):
        """Test model output shape matches number of classes."""
        import tensorflow as tf

        model_path = find_keras_model()
        model = tf.keras.models.load_model(model_path)

        # Output should be (batch_size, num_classes)
        output_shape = model.output_shape
        assert len(output_shape) == 2
        assert output_shape[1] == 8  # 8 classes in OnePen


@requires_model
class TestModelInference:
    """Tests for model inference on sample strokes."""

    @pytest.fixture
    def model(self):
        """Load the model for testing."""
        import tensorflow as tf
        model_path = find_keras_model()
        return tf.keras.models.load_model(model_path)

    @pytest.fixture
    def renderer(self):
        """Create a stroke renderer."""
        from modifiers.features.renderer import StrokeRenderer
        return StrokeRenderer(img_size=96, normalize_pixels=True)

    @pytest.fixture
    def feature_extractor(self):
        """Create a feature extractor."""
        from modifiers.features.geometric import GeometricFeatureExtractor
        return GeometricFeatureExtractor()

    def test_inference_on_box_stroke(self, model, renderer, feature_extractor):
        """Test inference on a box-like stroke."""
        # Normalized box stroke
        stroke = [
            {"x": 0.1, "y": 0.1},
            {"x": 0.9, "y": 0.1},
            {"x": 0.9, "y": 0.9},
            {"x": 0.1, "y": 0.9},
            {"x": 0.1, "y": 0.1},
        ]

        # Raw stroke for features (unnormalized)
        raw_stroke = [
            {"x": 10, "y": 10},
            {"x": 90, "y": 10},
            {"x": 90, "y": 90},
            {"x": 10, "y": 90},
            {"x": 10, "y": 10},
        ]

        # Render image
        image = renderer.render(stroke)
        image_batch = np.expand_dims(image, axis=0)

        # Extract features
        features = feature_extractor.extract(raw_stroke)
        features_batch = np.expand_dims(features, axis=0)

        # Run inference (model expects [image, features])
        try:
            predictions = model.predict([image_batch, features_batch], verbose=0)
        except Exception:
            # If model only takes image input
            predictions = model.predict(image_batch, verbose=0)

        assert predictions.shape[0] == 1
        assert predictions.shape[1] == 8  # 8 classes

        # Predictions should be probabilities (sum to ~1)
        assert np.abs(predictions.sum() - 1.0) < 0.01

    def test_inference_on_underline_stroke(self, model, renderer, feature_extractor):
        """Test inference on an underline stroke."""
        stroke = [
            {"x": 0.0, "y": 0.5},
            {"x": 1.0, "y": 0.5},
        ]

        raw_stroke = [
            {"x": 0, "y": 50},
            {"x": 200, "y": 50},
        ]

        image = renderer.render(stroke)
        image_batch = np.expand_dims(image, axis=0)
        features = feature_extractor.extract(raw_stroke)
        features_batch = np.expand_dims(features, axis=0)

        try:
            predictions = model.predict([image_batch, features_batch], verbose=0)
        except Exception:
            predictions = model.predict(image_batch, verbose=0)

        assert predictions.shape == (1, 8)
        assert np.all(predictions >= 0)  # Probabilities are non-negative

    def test_batch_inference(self, model, renderer, feature_extractor):
        """Test inference on a batch of strokes."""
        strokes = [
            # Box
            [{"x": 0.1, "y": 0.1}, {"x": 0.9, "y": 0.1}, {"x": 0.9, "y": 0.9}, {"x": 0.1, "y": 0.9}],
            # Underline
            [{"x": 0.0, "y": 0.5}, {"x": 1.0, "y": 0.5}],
            # Curly
            [{"x": 0.8, "y": 0.0}, {"x": 0.6, "y": 0.5}, {"x": 0.8, "y": 1.0}],
        ]

        raw_strokes = [
            [{"x": 10, "y": 10}, {"x": 90, "y": 10}, {"x": 90, "y": 90}, {"x": 10, "y": 90}],
            [{"x": 0, "y": 50}, {"x": 200, "y": 50}],
            [{"x": 80, "y": 0}, {"x": 60, "y": 50}, {"x": 80, "y": 100}],
        ]

        images = np.array([renderer.render(s) for s in strokes])
        features = np.array([feature_extractor.extract(s) for s in raw_strokes])

        try:
            predictions = model.predict([images, features], verbose=0)
        except Exception:
            predictions = model.predict(images, verbose=0)

        assert predictions.shape == (3, 8)

    def test_prediction_classes(self, model, renderer, feature_extractor):
        """Test that predicted classes are valid."""
        stroke = [{"x": 0.1, "y": 0.1}, {"x": 0.9, "y": 0.9}]
        raw_stroke = [{"x": 10, "y": 10}, {"x": 90, "y": 90}]

        image = renderer.render(stroke)
        image_batch = np.expand_dims(image, axis=0)
        features = feature_extractor.extract(raw_stroke)
        features_batch = np.expand_dims(features, axis=0)

        try:
            predictions = model.predict([image_batch, features_batch], verbose=0)
        except Exception:
            predictions = model.predict(image_batch, verbose=0)

        # Get predicted class
        predicted_class = np.argmax(predictions[0])

        # Should be a valid class index (0-7)
        assert 0 <= predicted_class <= 7

        # Expected classes
        class_names = [
            "underline", "box", "curly", "delete",
            "boxshortcut", "curlyshortcut", "circleshortcut", "none"
        ]
        assert predicted_class < len(class_names)


@requires_tf
class TestEndToEndPipeline:
    """End-to-end tests for the complete ML pipeline."""

    def test_full_pipeline_without_model(self):
        """Test the full preprocessing pipeline (no model needed)."""
        from modifiers.data.preprocessor import StrokePreprocessor
        from modifiers.features.renderer import StrokeRenderer
        from modifiers.features.geometric import GeometricFeatureExtractor

        # Raw input stroke
        raw_stroke = [
            {"x": 100, "y": 100, "p": 0.5},
            {"x": 200, "y": 100, "p": 0.6},
            {"x": 200, "y": 200, "p": 0.7},
            {"x": 100, "y": 200, "p": 0.6},
            {"x": 100, "y": 100, "p": 0.5},
        ]

        # 1. Preprocess (normalize)
        preprocessor = StrokePreprocessor(normalize=True)
        normalized = preprocessor.process_stroke(raw_stroke)

        assert len(normalized) == len(raw_stroke)
        assert all(0 <= p["x"] <= 1 for p in normalized)
        assert all(0 <= p["y"] <= 1 for p in normalized)

        # 2. Render to image
        renderer = StrokeRenderer(img_size=96, normalize_pixels=True)
        image = renderer.render(normalized)

        assert image.shape == (96, 96, 3)
        assert image.dtype == np.float32

        # 3. Extract geometric features
        extractor = GeometricFeatureExtractor()
        features = extractor.extract(raw_stroke)

        assert features.shape == (12,)
        assert features.dtype == np.float32

        # 4. Prepare for model input
        image_batch = np.expand_dims(image, axis=0)
        features_batch = np.expand_dims(features, axis=0)

        assert image_batch.shape == (1, 96, 96, 3)
        assert features_batch.shape == (1, 12)
