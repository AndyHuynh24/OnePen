"""Stroke to image rendering for CNN input."""

import numpy as np
from PIL import Image, ImageDraw
from typing import Any


def render_stroke_to_image(
    stroke: list[dict],
    img_size: int = 136,
    line_width: int = 3,
) -> np.ndarray:
    """Render a normalized stroke to a grayscale image.

    Stroke coordinates should be normalized to [0, 1] range.

    Args:
        stroke: List of points with 'x' and 'y' keys (normalized).
        img_size: Output image size (square).
        line_width: Width of the stroke line.

    Returns:
        Grayscale image as numpy array of shape (img_size, img_size).
    """
    # Handle empty stroke
    if not stroke or len(stroke) < 2:
        return np.ones((img_size, img_size), dtype=np.uint8) * 255

    # Create white image
    img = Image.new("L", (img_size, img_size), color=255)
    draw = ImageDraw.Draw(img)

    # Add margin to prevent clipping
    margin = line_width
    draw_size = img_size - 2 * margin

    # Scale normalized coordinates to image space
    xs = np.clip([pt["x"] for pt in stroke], 0, 1)
    ys = np.clip([pt["y"] for pt in stroke], 0, 1)

    scaled_xs = [margin + x * draw_size for x in xs]
    scaled_ys = [margin + y * draw_size for y in ys]

    # Draw stroke
    points = list(zip(scaled_xs, scaled_ys))
    draw.line(points, fill=0, width=line_width)

    return np.array(img)


class StrokeRenderer:
    """Renderer for converting strokes to images."""

    def __init__(
        self,
        img_size: int = 136,
        line_width: int = 3,
        to_rgb: bool = True,
        normalize_pixels: bool = True,
    ):
        """Initialize the renderer.

        Args:
            img_size: Output image size (square).
            line_width: Width of stroke lines.
            to_rgb: Convert grayscale to RGB (3 channels).
            normalize_pixels: Normalize pixel values to [0, 1].
        """
        self.img_size = img_size
        self.line_width = line_width
        self.to_rgb = to_rgb
        self.normalize_pixels = normalize_pixels

    def render(self, stroke: list[dict]) -> np.ndarray:
        """Render a single stroke to image.

        Args:
            stroke: Normalized stroke (0-1 coordinates).

        Returns:
            Image array with shape (img_size, img_size, 3) if to_rgb,
            else (img_size, img_size).
        """
        img = render_stroke_to_image(
            stroke,
            self.img_size,
            self.line_width,
        )

        # Convert to RGB
        if self.to_rgb:
            img = np.stack([img, img, img], axis=-1)

        # Normalize to [0, 1]
        if self.normalize_pixels:
            img = img.astype(np.float32) / 255.0

        return img

    def render_dataset(self, norm_data: list[dict[str, Any]]) -> np.ndarray:
        """Render multiple strokes to images.

        Args:
            norm_data: List of normalized stroke dictionaries with 'type' and 'stroke' keys.

        Returns:
            Image batch with shape (n, img_size, img_size, channels).
        """
        images = []

        for item in norm_data:
            stroke = item["stroke"]
            img = self.render(stroke)
            images.append(img)

        return np.array(images, dtype=np.float32)
    
    @property
    def output_shape(self) -> tuple[int, int, int]:
        """Get output image shape."""
        if self.to_rgb:
            return (self.img_size, self.img_size, 3)
        return (self.img_size, self.img_size, 1)

    def __repr__(self) -> str:
        return (
            f"StrokeRenderer(img_size={self.img_size}, "
            f"line_width={self.line_width}, to_rgb={self.to_rgb})"
        )
