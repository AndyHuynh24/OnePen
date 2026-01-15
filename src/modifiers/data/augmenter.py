"""Data augmentation for stroke classification."""

import random
from typing import Any

import numpy as np

from modifiers.utils.logging import get_logger

logger = get_logger("onepen.data")


def augment_stroke(
    stroke: list[dict],
    angle: float,
    shear: tuple[float, float],
    scale: tuple[float, float],
) -> list[dict]:
    """Apply geometric transformations to a stroke.

    Applies shear, scale, and rotation transformations in sequence.

    Args:
        stroke: List of points with 'x', 'y', and optional 'p' keys.
        angle: Rotation angle in degrees.
        shear: Tuple of (shear_x, shear_y) factors.
        scale: Tuple of (scale_x, scale_y) factors.

    Returns:
        Transformed stroke.
    """
    if not stroke:
        return []

    shear_x, shear_y = shear
    scale_x, scale_y = scale

    # Convert angle to radians
    rad = np.radians(angle)
    cos_a, sin_a = np.cos(rad), np.sin(rad)

    transformed = []
    for pt in stroke:
        x, y = pt["x"], pt["y"]

        # 1. Apply shear
        x_sheared = x + shear_x * y
        y_sheared = y + shear_y * x

        # 2. Apply scale
        x_scaled = x_sheared * scale_x
        y_scaled = y_sheared * scale_y

        # 3. Apply rotation
        x_new = cos_a * x_scaled - sin_a * y_scaled
        y_new = sin_a * x_scaled + cos_a * y_scaled

        transformed.append({
            "x": x_new,
            "y": y_new,
            "p": pt.get("p", 0),
        })

    return transformed


def flip_stroke_horizontal(stroke: list[dict]) -> list[dict]:
    """Flip stroke horizontally around its center.

    Args:
        stroke: List of points.

    Returns:
        Horizontally flipped stroke.
    """
    if not stroke:
        return []

    xs = [pt["x"] for pt in stroke]
    center_x = (max(xs) + min(xs)) / 2

    return [
        {"x": 2 * center_x - pt["x"], "y": pt["y"], "p": pt.get("p", 0)}
        for pt in stroke
    ]


class StrokeAugmenter:
    """Augmentation pipeline for stroke data."""

    def __init__(
        self,
        num_augmentations: int = 6,
        rotation_range: tuple[float, float] = (-6, 6),
        shear_x_range: tuple[float, float] = (-0.2, 0.2),
        shear_y_range: tuple[float, float] = (-0.1, 0.1),
        scale_x_range: tuple[float, float] = (0.9, 1.1),
        scale_y_range: tuple[float, float] = (0.9, 1.1),
        flip_horizontal: bool = True,
        flip_exclude_types: list[str] | None = None,
        rotation_exclude_types: list[str] | None = None,
        random_seed: int | None = None,
    ):
        """Initialize the augmenter.

        Args:
            num_augmentations: Number of augmented versions to create.
            rotation_range: Min/max rotation angle in degrees.
            shear_x_range: Min/max shear factor for x-axis.
            shear_y_range: Min/max shear factor for y-axis.
            scale_x_range: Min/max scale factor for x-axis.
            scale_y_range: Min/max scale factor for y-axis.
            flip_horizontal: Whether to also flip strokes horizontally.
            flip_exclude_types: Types to exclude from flipping.
            random_seed: Optional seed for reproducibility.
        """
        self.num_augmentations = num_augmentations
        self.rotation_range = rotation_range
        self.shear_x_range = shear_x_range
        self.shear_y_range = shear_y_range
        self.scale_x_range = scale_x_range
        self.scale_y_range = scale_y_range
        self.flip_horizontal = flip_horizontal
        self.rotation_exclude_types = rotation_exclude_types
        self.flip_exclude_types = flip_exclude_types or []

        if random_seed is not None:
            random.seed(random_seed)
            np.random.seed(random_seed)

    def _sample_params(self) -> tuple[float, tuple[float, float], tuple[float, float]]:
        """Sample random transformation parameters.

        Returns:
            Tuple of (angle, shear, scale).
        """
        angle = random.uniform(*self.rotation_range)
        shear = (
            random.uniform(*self.shear_x_range),
            random.uniform(*self.shear_y_range),
        )
        scale = (
            random.uniform(*self.scale_x_range),
            random.uniform(*self.scale_y_range),
        )
        return angle, shear, scale

    def augment_single(
        self,
        item: dict[str, Any],
        angle: float,
        shear: tuple[float, float],
        scale: tuple[float, float],
    ) -> dict[str, Any]:
        """Augment a single stroke item.

        Args:
            item: Dictionary with 'stroke' and 'type' keys.
            angle: Rotation angle.
            shear: Shear factors.
            scale: Scale factors.

        Returns:
            Augmented item.
        """
        stroke = item.get("stroke", [])

        if item["type"] in self.rotation_exclude_types: 
            angle = 0

        augmented_stroke = augment_stroke(stroke, angle, shear, scale)

        return {
            "type": item["type"],
            "stroke": augmented_stroke,
            "augmented": True,
        }

    def augment_dataset(
        self,
        data: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Augment entire dataset with multiple variations.
        
        Args:
            data: List of stroke dictionaries.

        Returns:
            Augmented dataset (original + augmented samples).
        """
        # Start with original data
        augmented_data = [{**item, "augmented": False} for item in data]

        for aug_idx in range(self.num_augmentations):
            # Sample transformation parameters for this batch
            angle, shear, scale = self._sample_params()

            logger.info(
                f"Augmentation {aug_idx + 1}/{self.num_augmentations}: "
                f"angle={angle:.2f}, shear={shear}, scale={scale}"
            )

            batch = []
            for item in data:
                # Apply transformation
                aug_item = self.augment_single(item, angle, shear, scale)
                batch.append(aug_item)

                # Optionally flip
                if self.flip_horizontal:
                    if item["type"] not in self.flip_exclude_types:
                        flipped_stroke = flip_stroke_horizontal(aug_item["stroke"])
                        batch.append({
                            "type": item["type"],
                            "stroke": flipped_stroke,
                            "augmented": True,
                            "flipped": True,
                        })

            augmented_data.extend(batch)

        logger.info(
            f"Augmentation complete: {len(data)} -> {len(augmented_data)} samples"
        )
        return augmented_data

    def __repr__(self) -> str:
        return (
            f"StrokeAugmenter(num_augmentations={self.num_augmentations}, "
            f"rotation={self.rotation_range}, flip={self.flip_horizontal})"
            f"rotate_exclude_types= {self.rotation_exclude_types}"
        )
