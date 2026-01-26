"""Tests for geometric feature extraction module."""

import pytest
import numpy as np
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from modifiers.features.geometric import compute_geometric_features, GeometricFeatureExtractor


class TestComputeGeometricFeatures:
    """Tests for compute_geometric_features function."""

    def test_basic_features(self):
        """Test basic feature computation."""
        stroke = [
            {"x": 0, "y": 0},
            {"x": 100, "y": 0},
            {"x": 100, "y": 100},
            {"x": 0, "y": 100},
        ]

        features = compute_geometric_features(stroke)

        assert features.shape == (12,)
        assert features.dtype == np.float32

    def test_empty_stroke(self):
        """Test features for empty stroke."""
        features = compute_geometric_features([])

        assert features.shape == (12,)
        assert np.all(features == 0)

    def test_single_point(self):
        """Test features for single point stroke."""
        stroke = [{"x": 50, "y": 50}]
        features = compute_geometric_features(stroke)

        assert features.shape == (12,)
        assert np.all(features == 0)

    def test_horizontal_line_features(self):
        """Test features for horizontal line."""
        stroke = [
            {"x": 0, "y": 50},
            {"x": 200, "y": 50},
        ]

        features = compute_geometric_features(stroke)

        # Aspect ratio should indicate horizontal (close to 1.0)
        aspect_ratio = features[3]
        assert aspect_ratio > 0.9  # More horizontal than vertical

        # Spine verticality should be low (horizontal line)
        spine_verticality = features[10]
        assert spine_verticality < 0.1

    def test_vertical_line_features(self):
        """Test features for vertical line."""
        stroke = [
            {"x": 50, "y": 0},
            {"x": 50, "y": 200},
        ]

        features = compute_geometric_features(stroke)

        # Aspect ratio should indicate vertical (close to 0)
        aspect_ratio = features[3]
        assert aspect_ratio < 0.1

        # Spine verticality should be high (vertical line)
        spine_verticality = features[10]
        assert spine_verticality > 0.9

    def test_closed_shape_features(self):
        """Test features for closed shape (box)."""
        stroke = [
            {"x": 0, "y": 0},
            {"x": 100, "y": 0},
            {"x": 100, "y": 100},
            {"x": 0, "y": 100},
            {"x": 0, "y": 0},  # Close the shape
        ]

        features = compute_geometric_features(stroke)

        # Closure ratio should be high (end == start)
        closure_ratio = features[0]
        assert closure_ratio > 0.99

    def test_open_shape_features(self):
        """Test features for open shape."""
        stroke = [
            {"x": 0, "y": 0},
            {"x": 100, "y": 100},
        ]

        features = compute_geometric_features(stroke)

        # Closure ratio should be low (end far from start)
        closure_ratio = features[0]
        assert closure_ratio < 0.5

    def test_compactness_feature(self):
        """Test compactness feature (path length / diagonal)."""
        # Simple diagonal line
        simple_stroke = [
            {"x": 0, "y": 0},
            {"x": 100, "y": 100},
        ]

        # Zigzag path (longer path, same diagonal)
        zigzag_stroke = [
            {"x": 0, "y": 0},
            {"x": 50, "y": 50},
            {"x": 0, "y": 100},
            {"x": 100, "y": 100},
        ]

        simple_features = compute_geometric_features(simple_stroke)
        zigzag_features = compute_geometric_features(zigzag_stroke)

        # Zigzag should have higher compactness (longer path)
        assert zigzag_features[1] > simple_features[1]

    def test_feature_bounds(self):
        """Test that features are within expected bounds."""
        strokes = [
            [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
            [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 100, "y": 100}, {"x": 0, "y": 0}],
            [{"x": 50, "y": 0}, {"x": 30, "y": 50}, {"x": 50, "y": 100}],
        ]

        for stroke in strokes:
            features = compute_geometric_features(stroke)

            # Closure ratio: [0, 1]
            assert 0 <= features[0] <= 1

            # Aspect ratio: [0, 1]
            assert 0 <= features[3] <= 1

            # Spine verticality: [0, 1]
            assert 0 <= features[10] <= 1

            # Height diff: [-1, 1]
            assert -1 <= features[6] <= 1


class TestGeometricFeatureExtractor:
    """Tests for GeometricFeatureExtractor class."""

    def test_init_defaults(self):
        """Test default initialization."""
        extractor = GeometricFeatureExtractor()

        assert extractor.height_threshold == 45
        assert extractor.cap_value == 100
        assert extractor.selected_indices is None
        assert extractor.n_features == 12

    def test_init_custom(self):
        """Test custom initialization."""
        extractor = GeometricFeatureExtractor(
            height_threshold=50,
            cap_value=200,
            selected_indices=[0, 1, 2],
        )

        assert extractor.height_threshold == 50
        assert extractor.cap_value == 200
        assert extractor.n_features == 3

    def test_extract_all_features(self):
        """Test extracting all 12 features."""
        extractor = GeometricFeatureExtractor()
        stroke = [{"x": 0, "y": 0}, {"x": 100, "y": 100}]

        features = extractor.extract(stroke)

        assert features.shape == (12,)

    def test_extract_selected_features(self):
        """Test extracting selected features."""
        extractor = GeometricFeatureExtractor(selected_indices=[0, 3, 10])
        stroke = [{"x": 0, "y": 0}, {"x": 100, "y": 100}]

        features = extractor.extract(stroke)

        assert features.shape == (3,)

    def test_extract_dataset(self):
        """Test extracting features from dataset."""
        extractor = GeometricFeatureExtractor()
        dataset = [
            {"type": "box", "stroke": [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 100, "y": 100}]},
            {"type": "underline", "stroke": [{"x": 0, "y": 50}, {"x": 200, "y": 50}]},
            {"type": "curly", "stroke": [{"x": 80, "y": 0}, {"x": 60, "y": 50}, {"x": 80, "y": 100}]},
        ]

        features = extractor.extract_dataset(dataset)

        assert features.shape == (3, 12)
        assert features.dtype == np.float32

    def test_feature_names(self):
        """Test feature names are correct."""
        extractor = GeometricFeatureExtractor()

        assert len(extractor.feature_names) == 12
        assert "closure_ratio" in extractor.feature_names
        assert "aspect_ratio" in extractor.feature_names
        assert "compactness" in extractor.feature_names

    def test_get_selected_names(self):
        """Test getting names of selected features."""
        extractor = GeometricFeatureExtractor(selected_indices=[0, 3])
        names = extractor.get_selected_names()

        assert len(names) == 2
        assert names[0] == "closure_ratio"
        assert names[1] == "aspect_ratio"

    def test_repr(self):
        """Test string representation."""
        extractor = GeometricFeatureExtractor(selected_indices=[0, 1, 2])
        repr_str = repr(extractor)

        assert "GeometricFeatureExtractor" in repr_str
        assert "n_features=3" in repr_str


class TestFeatureExtractionIntegration:
    """Integration tests for feature extraction with real stroke types."""

    def test_box_vs_underline_features(self):
        """Test that box and underline have different feature profiles."""
        extractor = GeometricFeatureExtractor()

        # Box stroke (closed, square-ish)
        box_stroke = [
            {"x": 0, "y": 0},
            {"x": 100, "y": 0},
            {"x": 100, "y": 100},
            {"x": 0, "y": 100},
            {"x": 0, "y": 0},
        ]

        # Underline stroke (open, horizontal)
        underline_stroke = [
            {"x": 0, "y": 50},
            {"x": 200, "y": 50},
        ]

        box_features = extractor.extract(box_stroke)
        underline_features = extractor.extract(underline_stroke)

        # Box should have higher closure ratio
        assert box_features[0] > underline_features[0]

        # Underline should have higher aspect ratio (more horizontal)
        assert underline_features[3] > box_features[3]

    def test_curly_features(self):
        """Test features for curly bracket stroke."""
        extractor = GeometricFeatureExtractor()

        curly_stroke = [
            {"x": 80, "y": 0},
            {"x": 60, "y": 25},
            {"x": 40, "y": 50},
            {"x": 60, "y": 75},
            {"x": 80, "y": 100},
        ]

        features = extractor.extract(curly_stroke)

        # Should be more vertical than horizontal
        assert features[3] < 0.5  # Aspect ratio

        # Should have high spine verticality
        assert features[10] > 0.8

    def test_delete_stroke_features(self):
        """Test features for delete (scribble) stroke."""
        extractor = GeometricFeatureExtractor()

        # Zigzag scribble pattern
        delete_stroke = [
            {"x": 0, "y": 0},
            {"x": 30, "y": 20},
            {"x": 60, "y": 0},
            {"x": 90, "y": 20},
            {"x": 120, "y": 0},
        ]

        features = extractor.extract(delete_stroke)

        # Should have high compactness (long path relative to bounding box)
        assert features[1] > 1.5
