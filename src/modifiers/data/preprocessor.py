"""Stroke preprocessing utilities."""

from typing import Any

import numpy as np

from modifiers.utils.logging import get_logger

logger = get_logger("onepen.data")

def get_bounding_box(stroke: list[dict]) -> tuple[float, float, float, float]:
    """Get bounding box of a stroke.

    Args:
        stroke: List of points with 'x' and 'y' keys.

    Returns:
        Tuple of (x_min, x_max, y_min, y_max).
    """
    xs = [pt["x"] for pt in stroke]
    ys = [pt["y"] for pt in stroke]
    return min(xs), max(xs), min(ys), max(ys)


def smooth_stroke(stroke: list[dict], window_size: int = 5) -> list[dict]:
    """Apply moving average smoothing to a stroke.

    Args:
        stroke: List of points with 'x', 'y', and optional 'p' keys.
        window_size: Size of the smoothing window (must be odd).

    Returns:
        Smoothed stroke with same structure.
    """
    if len(stroke) < window_size:
        return stroke

    half_window = window_size // 2
    smoothed = []

    for i in range(len(stroke)):
        # Calculate window bounds
        start = max(0, i - half_window)
        end = min(len(stroke), i + half_window + 1)

        # Average points in window
        window_pts = stroke[start:end]
        avg_x = sum(pt["x"] for pt in window_pts) / len(window_pts)
        avg_y = sum(pt["y"] for pt in window_pts) / len(window_pts)
        avg_p = sum(pt.get("p", 0) for pt in window_pts) / len(window_pts)

        smoothed.append({"x": avg_x, "y": avg_y, "p": avg_p})

    return smoothed


def normalize_stroke(stroke: list[dict]) -> list[dict]:
    """Normalize stroke coordinates to [0, 1] range.

    Args:
        stroke: List of points with 'x', 'y', and optional 'p' keys.

    Returns:
        Normalized stroke with coordinates in [0, 1].
    """
    if not stroke:
        return []

    x_min, x_max, y_min, y_max = get_bounding_box(stroke)

    # Avoid division by zero
    width = max(x_max - x_min, 1e-6)
    height = max(y_max - y_min, 1e-6)

    normalized = []
    for pt in stroke:
        normalized.append({
            "x": (pt["x"] - x_min) / width,
            "y": (pt["y"] - y_min) / height,
            "p": pt.get("p", 0),
        })

    return normalized


class StrokePreprocessor:
    """Preprocessor for stroke data."""

    def __init__(
        self,
        smooth: bool = False,
        smooth_window: int = 5,
        normalize: bool = True,
    ):
        """Initialize the preprocessor.

        Args:
            smooth: Whether to apply smoothing.
            smooth_window: Window size for smoothing.
            normalize: Whether to normalize coordinates.
        """
        self.smooth = smooth
        self.smooth_window = smooth_window
        self.normalize = normalize

    def process_stroke(self, stroke: list[dict]) -> list[dict]:
        """Process a single stroke.

        Args:
            stroke: Raw stroke data.

        Returns:
            Processed stroke.
        """
        if len(stroke) < 2:
            return stroke

        result = stroke

        if self.smooth:
            result = smooth_stroke(result, self.smooth_window)

        if self.normalize:
            result = normalize_stroke(result)

        return result

    def process_dataset(
        self,
        data: list[dict[str, Any]],
        class_to_idx:  dict[str, int],
    ) -> tuple[list[dict], list[dict]]:
        """Process entire dataset, returning BOTH raw and normalized.

        Args:
            data: List of stroke dictionaries with 'stroke' key.

        Returns:
            Tuple of (raw_data, normalized_data) where each item
            has the processed stroke in 'stroke' key.
        """
        raw_data = []
        normalized_data = []

        for item in data:
            stroke = item.get("stroke", [])

            #Clean any unrealistic stroke (no stroke should be created with just 2 data poitns, which may be caused by accident)
            if len(stroke) <= 2 or item["type"] not in class_to_idx: 
                continue

            # Keep raw (for later use)
            raw_item = {**item, "stroke": stroke} #copy
            raw_data.append(raw_item)

            # Normalize
            norm_stroke = self.process_stroke(stroke)
            norm_item = {**item, "stroke": norm_stroke}
            normalized_data.append(norm_item)

        logger.info(f"Processed {len(normalized_data)} strokes")
        return raw_data, normalized_data

    def __repr__(self) -> str:
        return (
            f"StrokePreprocessor(smooth={self.smooth}, "
            f"smooth_window={self.smooth_window}, normalize={self.normalize})"
        )
