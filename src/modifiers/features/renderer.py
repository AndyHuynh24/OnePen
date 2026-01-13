"""Stroke to image rendering for CNN input."""

import numpy as np
from PIL import Image, ImageDraw
from typing import Any


def render_stroke_to_image(
    stroke: list[dict],
    img_size: int = 136,
    line_width: int = 3,
    antialiasing: bool = True,
    scale_factor: int = 4,
    smooth: bool = False,
) -> np.ndarray:
    """Render a normalized stroke to a grayscale image.

    Stroke coordinates should be normalized to [0, 1] range.

    Args:
        stroke: List of points with 'x' and 'y' keys (normalized).
        img_size: Output image size (square).
        line_width: Width of the stroke line.
        antialiasing: Whether to use supersampling for anti-aliasing.
        scale_factor: Factor to upscale the image for supersampling.
        smooth: Whether to use Quadratic Bezier smoothing.

    Returns:
        Grayscale image as numpy array of shape (img_size, img_size).
    """
    # Handle empty stroke
    if not stroke or len(stroke) < 2:
        return np.ones((img_size, img_size), dtype=np.uint8) * 255

    # Determine render size
    target_size = img_size
    target_width = line_width
    
    if antialiasing:
        render_size = target_size * scale_factor
        render_width = target_width * scale_factor
    else:
        render_size = target_size
        render_width = target_width

    # Create white image
    img = Image.new("L", (render_size, render_size), color=255)
    draw = ImageDraw.Draw(img)

    # Add margin to prevent clipping
    margin = render_width
    draw_size = render_size - 2 * margin

    # Scale normalized coordinates to image space
    xs = np.clip([pt["x"] for pt in stroke], 0, 1)
    ys = np.clip([pt["y"] for pt in stroke], 0, 1)

    # Convert to tuples for easier processing
    pts = list(zip(xs, ys))

    scaled_pts = [(margin + p[0] * draw_size, margin + p[1] * draw_size) for p in pts]

    if smooth and len(scaled_pts) >= 3:
        # Helper for quadratic bezier points (Vectorized)
        def get_quad_points(p0, p1, p2, steps=10):
            t = np.linspace(0, 1, steps)
            x = (1-t)**2 * p0[0] + 2*(1-t)*t * p1[0] + t**2 * p2[0]
            y = (1-t)**2 * p0[1] + 2*(1-t)*t * p1[1] + t**2 * p2[1]
            return list(zip(x, y))

        full_path = [scaled_pts[0]]
        
        # Calculate steps based on whether we are supersampling to ensure smoothness
        steps = max(10, int(10 * (scale_factor if antialiasing else 1)))

        for i in range(1, len(scaled_pts) - 1):
            control = scaled_pts[i]
            next_pt = scaled_pts[i+1]
            
            # Midpoint is the end of the current quadratic curve
            end_x = (control[0] + next_pt[0]) / 2
            end_y = (control[1] + next_pt[1]) / 2
            end = (end_x, end_y)
            
            # Start of curve
            if i == 1:
                start = scaled_pts[0]
            else:
                prev_control = scaled_pts[i-1]
                start_x = (prev_control[0] + control[0]) / 2
                start_y = (prev_control[1] + control[1]) / 2
                start = (start_x, start_y)
                
            curve = get_quad_points(start, control, end, steps=steps)
            full_path.extend(curve)
            
        # Connect to the last point
        full_path.append(scaled_pts[-1])
        
        # Draw the smooth path
        draw.line(full_path, fill=0, width=render_width)
    else:
        # Draw standard straight lines
        draw.line(scaled_pts, fill=0, width=render_width)

    # Downsample if anti-aliasing enabled
    if antialiasing:
        # Compatibility check for Pillow versions
        if hasattr(Image, "Resampling"):
            resample_method = Image.Resampling.LANCZOS
        else:
            # Fallback for older Pillow versions
            resample_method = Image.LANCZOS if hasattr(Image, "LANCZOS") else Image.ANTIALIAS
            
        img = img.resize((target_size, target_size), resample=resample_method)

    return np.array(img)


class StrokeRenderer:
    """Renderer for converting strokes to images."""

    def __init__(
        self,
        img_size: int = 136,
        line_width: int = 3,
        to_rgb: bool = True,
        normalize_pixels: bool = True,
        antialiasing: bool = False,
        scale_factor: int = 4,
        smooth: bool = False,
    ):
        """Initialize the renderer.

        Args:
            img_size: Output image size (square).
            line_width: Width of stroke lines.
            to_rgb: Convert grayscale to RGB (3 channels).
            normalize_pixels: Normalize pixel values to [0, 1].
            antialiasing: Use anti-aliasing rendering.
            scale_factor: Supersampling scale factor.
            smooth: Use Quadratic Bezier smoothing.
        """
        self.img_size = img_size
        self.line_width = line_width
        self.to_rgb = to_rgb
        self.normalize_pixels = normalize_pixels
        self.antialiasing = antialiasing
        self.scale_factor = scale_factor
        self.smooth = smooth

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
            antialiasing=self.antialiasing,
            scale_factor=self.scale_factor,
            smooth=self.smooth,
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
            f"line_width={self.line_width}, to_rgb={self.to_rgb}, "
            f"antialiasing={self.antialiasing}, smooth={self.smooth})"
        )
