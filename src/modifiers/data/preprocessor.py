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
        normalize: bool = True,
    ):
        """Initialize the preprocessor.

        Args:
            normalize: Whether to normalize coordinates.
        """
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
        skipping_count = 0

        for item in data:
            stroke = item.get("stroke", [])

            x_min, x_max, y_min, y_max = get_bounding_box(stroke)
            width = x_max - x_min

            #Clean any unrealistic stroke (no stroke should be created with just 2 data poitns, which may be caused by accident)
            if len(stroke) <= 2 or item["type"] not in class_to_idx or width <= 8: 
                logger.info("Skip 1 item due to few stroke points")
                skipping_count += 1
                continue

            # Keep raw (for later use)
            raw_item = {**item, "stroke": stroke} #copy
            raw_data.append(raw_item)

            # Normalize
            norm_stroke = self.process_stroke(stroke)
            norm_item = {**item, "stroke": norm_stroke}
            normalized_data.append(norm_item)

        logger.info(f"Skipped {skipping_count} strokes")
        logger.info(f"Processed {len(normalized_data)} strokes")
    
        return raw_data, normalized_data

    def __repr__(self) -> str:
        return (
            f"StrokePreprocessor(normalize={self.normalize})"
        )
