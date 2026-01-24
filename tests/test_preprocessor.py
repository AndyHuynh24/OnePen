"""Tests for stroke preprocessing module."""

import pytest
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from modifiers.data.preprocessor import (
    get_bounding_box,
    normalize_stroke,
    StrokePreprocessor,
)


class TestGetBoundingBox:
    """Tests for get_bounding_box function."""

    def test_simple_stroke(self, sample_stroke):
        """Test bounding box calculation for a simple stroke."""
        x_min, x_max, y_min, y_max = get_bounding_box(sample_stroke)

        assert x_min == 100
        assert x_max == 250
        assert y_min == 150
        assert y_max == 250

    def test_single_point(self):
        """Test bounding box for single point stroke."""
        stroke = [{"x": 50, "y": 75}]
        x_min, x_max, y_min, y_max = get_bounding_box(stroke)

        assert x_min == x_max == 50
        assert y_min == y_max == 75

    def test_horizontal_line(self):
        """Test bounding box for horizontal line."""
        stroke = [{"x": 0, "y": 100}, {"x": 200, "y": 100}]
        x_min, x_max, y_min, y_max = get_bounding_box(stroke)

        assert x_min == 0
        assert x_max == 200
        assert y_min == y_max == 100


class TestNormalizeStroke:
    """Tests for normalize_stroke function."""

    def test_normalize_coordinates(self, sample_stroke):
        """Test that normalization produces values in [0, 1]."""
        normalized = normalize_stroke(sample_stroke)

        for point in normalized:
            assert 0 <= point["x"] <= 1
            assert 0 <= point["y"] <= 1

    def test_preserve_pressure(self, sample_stroke):
        """Test that pressure values are preserved."""
        normalized = normalize_stroke(sample_stroke)

        for orig, norm in zip(sample_stroke, normalized):
            assert norm["p"] == orig["p"]

    def test_empty_stroke(self):
        """Test normalization of empty stroke."""
        result = normalize_stroke([])
        assert result == []

    def test_default_pressure(self, sample_stroke_minimal):
        """Test that missing pressure defaults to 0."""
        normalized = normalize_stroke(sample_stroke_minimal)

        for point in normalized:
            assert point["p"] == 0

    def test_normalized_extremes(self, sample_stroke):
        """Test that normalized stroke has 0 and 1 at extremes."""
        normalized = normalize_stroke(sample_stroke)

        x_values = [p["x"] for p in normalized]
        y_values = [p["y"] for p in normalized]

        assert min(x_values) == 0
        assert max(x_values) == 1
        assert min(y_values) == 0
        assert max(y_values) == 1


class TestStrokePreprocessor:
    """Tests for StrokePreprocessor class."""

    def test_init_default(self):
        """Test default initialization."""
        preprocessor = StrokePreprocessor()
        assert preprocessor.normalize is True

    def test_init_custom(self):
        """Test custom initialization."""
        preprocessor = StrokePreprocessor(normalize=False)
        assert preprocessor.normalize is False

    def test_process_stroke_with_normalization(self, sample_stroke):
        """Test processing single stroke with normalization."""
        preprocessor = StrokePreprocessor(normalize=True)
        result = preprocessor.process_stroke(sample_stroke)

        # Should be normalized
        for point in result:
            assert 0 <= point["x"] <= 1
            assert 0 <= point["y"] <= 1

    def test_process_stroke_without_normalization(self, sample_stroke):
        """Test processing single stroke without normalization."""
        preprocessor = StrokePreprocessor(normalize=False)
        result = preprocessor.process_stroke(sample_stroke)

        # Should be unchanged
        assert result == sample_stroke

    def test_process_short_stroke(self):
        """Test that short strokes are returned as-is."""
        preprocessor = StrokePreprocessor(normalize=True)
        short_stroke = [{"x": 10, "y": 20}]
        result = preprocessor.process_stroke(short_stroke)

        assert result == short_stroke

    def test_process_dataset(self, sample_dataset):
        """Test processing entire dataset."""
        preprocessor = StrokePreprocessor(normalize=True)
        class_to_idx = {"box": 0, "underline": 1, "curly": 2, "delete": 3, "none": 4}

        raw_data, normalized_data = preprocessor.process_dataset(
            sample_dataset, class_to_idx
        )

        # Should return both raw and normalized
        assert len(raw_data) == len(normalized_data)
        assert len(raw_data) <= len(sample_dataset)

        # Normalized data should have values in [0, 1]
        for item in normalized_data:
            for point in item["stroke"]:
                assert 0 <= point["x"] <= 1
                assert 0 <= point["y"] <= 1

    def test_process_dataset_filters_invalid(self):
        """Test that invalid strokes are filtered out."""
        preprocessor = StrokePreprocessor(normalize=True)
        class_to_idx = {"box": 0}

        dataset = [
            # Valid stroke
            {"type": "box", "stroke": [
                {"x": 0, "y": 0}, {"x": 50, "y": 0}, {"x": 50, "y": 50}
            ]},
            # Too short (only 2 points)
            {"type": "box", "stroke": [{"x": 0, "y": 0}, {"x": 10, "y": 10}]},
            # Unknown type
            {"type": "unknown", "stroke": [
                {"x": 0, "y": 0}, {"x": 50, "y": 0}, {"x": 50, "y": 50}
            ]},
        ]

        raw_data, normalized_data = preprocessor.process_dataset(dataset, class_to_idx)

        # Only the valid stroke should pass
        assert len(raw_data) == 1
        assert len(normalized_data) == 1

    def test_repr(self):
        """Test string representation."""
        preprocessor = StrokePreprocessor(normalize=True)
        repr_str = repr(preprocessor)

        assert "StrokePreprocessor" in repr_str
        assert "normalize=True" in repr_str
