"""Tests for stroke rendering module."""

import pytest
import numpy as np
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from modifiers.features.renderer import render_stroke_to_image, StrokeRenderer


class TestRenderStrokeToImage:
    """Tests for render_stroke_to_image function."""

    def test_basic_rendering(self):
        """Test basic stroke rendering produces valid image."""
        stroke = [
            {"x": 0.0, "y": 0.0},
            {"x": 0.5, "y": 0.5},
            {"x": 1.0, "y": 1.0},
        ]
        img = render_stroke_to_image(stroke, img_size=64)

        assert img.shape == (64, 64)
        assert img.dtype == np.uint8
        assert img.min() >= 0
        assert img.max() <= 255

    def test_empty_stroke(self):
        """Test rendering empty stroke returns white image."""
        img = render_stroke_to_image([], img_size=64)

        assert img.shape == (64, 64)
        assert np.all(img == 255)  # Should be all white

    def test_single_point_stroke(self):
        """Test single point stroke returns white image."""
        stroke = [{"x": 0.5, "y": 0.5}]
        img = render_stroke_to_image(stroke, img_size=64)

        assert img.shape == (64, 64)
        assert np.all(img == 255)  # Should be all white (need 2+ points)

    def test_stroke_has_black_pixels(self):
        """Test that rendered stroke contains black pixels (the line)."""
        stroke = [
            {"x": 0.1, "y": 0.5},
            {"x": 0.9, "y": 0.5},
        ]
        img = render_stroke_to_image(stroke, img_size=64, line_width=3)

        # Should have some black pixels (the stroke line)
        assert img.min() < 255

    def test_different_image_sizes(self):
        """Test rendering at different image sizes."""
        stroke = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}]

        for size in [32, 64, 96, 128]:
            img = render_stroke_to_image(stroke, img_size=size)
            assert img.shape == (size, size)

    def test_antialiasing(self):
        """Test that antialiasing produces smoother output."""
        stroke = [
            {"x": 0.0, "y": 0.0},
            {"x": 1.0, "y": 1.0},
        ]

        img_no_aa = render_stroke_to_image(stroke, img_size=64, antialiasing=False)
        img_with_aa = render_stroke_to_image(stroke, img_size=64, antialiasing=True)

        # Both should be valid
        assert img_no_aa.shape == (64, 64)
        assert img_with_aa.shape == (64, 64)

        # Antialiased version should have more unique values (smoother gradients)
        unique_no_aa = len(np.unique(img_no_aa))
        unique_with_aa = len(np.unique(img_with_aa))
        assert unique_with_aa >= unique_no_aa


class TestStrokeRenderer:
    """Tests for StrokeRenderer class."""

    def test_init_defaults(self):
        """Test default initialization."""
        renderer = StrokeRenderer()

        assert renderer.img_size == 136
        assert renderer.line_width == 3
        assert renderer.to_rgb is True
        assert renderer.normalize_pixels is True

    def test_init_custom(self):
        """Test custom initialization."""
        renderer = StrokeRenderer(
            img_size=96,
            line_width=2,
            to_rgb=False,
            normalize_pixels=False,
        )

        assert renderer.img_size == 96
        assert renderer.line_width == 2
        assert renderer.to_rgb is False
        assert renderer.normalize_pixels is False

    def test_render_rgb(self):
        """Test rendering with RGB output."""
        renderer = StrokeRenderer(img_size=64, to_rgb=True, normalize_pixels=False)
        stroke = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}]

        img = renderer.render(stroke)

        assert img.shape == (64, 64, 3)

    def test_render_grayscale(self):
        """Test rendering with grayscale output."""
        renderer = StrokeRenderer(img_size=64, to_rgb=False, normalize_pixels=False)
        stroke = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}]

        img = renderer.render(stroke)

        assert img.shape == (64, 64)

    def test_render_normalized(self):
        """Test rendering with normalized pixel values."""
        renderer = StrokeRenderer(img_size=64, normalize_pixels=True)
        stroke = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}]

        img = renderer.render(stroke)

        assert img.dtype == np.float32
        assert img.min() >= 0.0
        assert img.max() <= 1.0

    def test_render_unnormalized(self):
        """Test rendering without normalization."""
        renderer = StrokeRenderer(img_size=64, normalize_pixels=False, to_rgb=False)
        stroke = [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}]

        img = renderer.render(stroke)

        assert img.dtype == np.uint8
        assert img.max() <= 255

    def test_render_dataset(self):
        """Test rendering multiple strokes."""
        renderer = StrokeRenderer(img_size=64)
        dataset = [
            {"type": "box", "stroke": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}]},
            {"type": "underline", "stroke": [{"x": 0, "y": 0.5}, {"x": 1, "y": 0.5}]},
            {"type": "curly", "stroke": [{"x": 0.5, "y": 0}, {"x": 0.3, "y": 0.5}, {"x": 0.5, "y": 1}]},
        ]

        images = renderer.render_dataset(dataset)

        assert images.shape == (3, 64, 64, 3)
        assert images.dtype == np.float32

    def test_output_shape_property(self):
        """Test output_shape property."""
        renderer_rgb = StrokeRenderer(img_size=96, to_rgb=True)
        renderer_gray = StrokeRenderer(img_size=96, to_rgb=False)

        assert renderer_rgb.output_shape == (96, 96, 3)
        assert renderer_gray.output_shape == (96, 96, 1)

    def test_repr(self):
        """Test string representation."""
        renderer = StrokeRenderer(img_size=64, line_width=2)
        repr_str = repr(renderer)

        assert "StrokeRenderer" in repr_str
        assert "img_size=64" in repr_str
        assert "line_width=2" in repr_str


class TestStrokeRenderingIntegration:
    """Integration tests for the rendering pipeline."""

    def test_box_stroke_rendering(self):
        """Test rendering a box-like stroke."""
        # Normalized box stroke
        stroke = [
            {"x": 0.1, "y": 0.1},
            {"x": 0.9, "y": 0.1},
            {"x": 0.9, "y": 0.9},
            {"x": 0.1, "y": 0.9},
            {"x": 0.1, "y": 0.1},  # Close the box
        ]

        renderer = StrokeRenderer(img_size=64, normalize_pixels=True)
        img = renderer.render(stroke)

        # Should have the stroke (some pixels < 1.0)
        assert img.min() < 1.0
        assert img.shape == (64, 64, 3)

    def test_underline_stroke_rendering(self):
        """Test rendering an underline stroke."""
        # Horizontal line in the middle
        stroke = [
            {"x": 0.0, "y": 0.5},
            {"x": 1.0, "y": 0.5},
        ]

        renderer = StrokeRenderer(img_size=64, normalize_pixels=False, to_rgb=False)
        img = renderer.render(stroke)

        # Middle row should have dark pixels
        middle_row = img[32, :]
        assert middle_row.min() < 255

    def test_curly_stroke_rendering(self):
        """Test rendering a curly bracket-like stroke."""
        # Simplified curly shape
        stroke = [
            {"x": 0.8, "y": 0.0},
            {"x": 0.6, "y": 0.2},
            {"x": 0.4, "y": 0.5},
            {"x": 0.6, "y": 0.8},
            {"x": 0.8, "y": 1.0},
        ]

        renderer = StrokeRenderer(img_size=64)
        img = renderer.render(stroke)

        assert img.shape == (64, 64, 3)
        assert img.min() < 1.0  # Has stroke content
