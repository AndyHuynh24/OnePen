"""Geometric feature extraction for stroke classification."""

import numpy as np
from typing import Any


def compute_geometric_features(
    raw_stroke: list[dict],
    height_threshold: float = 45,
    cap_value: float = 100,
) -> np.ndarray:
    """Compute 10D geometric feature vector from stroke data.

    Args:
        raw_stroke: Original stroke coordinates.
        height_threshold: Threshold for height feature.
        cap_value: Cap value for height feature.

    Returns:
        10D numpy array of features.
    """
    # Handle edge cases
    if len(raw_stroke) < 2:
        return np.zeros(10, dtype=np.float32)

    # Extract coordinates
    pts_raw = np.array([[p["x"], p["y"]] for p in raw_stroke])
    x, y = pts_raw[:, 0], pts_raw[:, 1]
    n_points = len(pts_raw)

    # Bounding box
    x_min, x_max = x.min(), x.max()
    y_min, y_max = y.min(), y.max()
    w = max(x_max - x_min, 1e-6)
    h = max(y_max - y_min, 1e-6)
    diag = np.sqrt(w**2 + h**2)

    # Segment lengths
    deltas = np.diff(pts_raw, axis=0)
    seg_lengths = np.linalg.norm(deltas, axis=1)
    total_len = np.sum(seg_lengths)

    # Feature 0: Closure ratio (how close end is to start)
    end_to_start_dist = np.sqrt((x[-1] - x[0])**2 + (y[-1] - y[0])**2)
    closure_ratio = 1 - min(end_to_start_dist / (diag + 1e-6), 1.0)

    # Feature 1: Compactness (path length / diagonal)
    compactness = total_len / (diag + 1e-6)

    # Feature 2: Spread ratio (point spread / diagonal)
    center = pts_raw.mean(axis=0)
    spread = np.std(np.linalg.norm(pts_raw - center, axis=1))
    spread_ratio = spread / (diag + 1e-6)

    # Feature 3: Aspect ratio bounded using atan (0.5 = square)
    aspect_ratio = 2 * np.arctan(w / h) / np.pi

    # Feature 4: Edge fraction (using normalized stroke)
    x_norm = (x - x_min) / w
    y_norm = (y - y_min) / h
    edge_thresh = 0.1
    d_edge = np.minimum.reduce([x_norm, 1 - x_norm, y_norm, 1 - y_norm])
    edge_frac = np.mean(d_edge < edge_thresh)

    # Feature 5: Number of points
    num_points_feat = float(n_points)

    # Feature 6: Height difference from threshold (normalized)
    height_diff = np.clip((h - height_threshold) / cap_value, -1.0, 1.0)

    # Feature 7: Horizontal variance (std of x)
    horiz_var = np.std(x)

    # Feature 8: Total length (already computed)
    # total_len

    # Feature 9: Perimeter to diagonal ratio
    perim_diag_ratio = (2 * (w + h)) / (diag + 1e-6)

    return np.array([
        closure_ratio,      # 0
        compactness,        # 1
        spread_ratio,       # 2
        aspect_ratio,       # 3
        edge_frac,          # 4
        num_points_feat,    # 5
        height_diff,        # 6
        horiz_var,          # 7
        total_len,          # 8
        perim_diag_ratio,   # 9
    ], dtype=np.float32)


class GeometricFeatureExtractor:
    """Feature extractor for stroke geometric features."""

    def __init__(
        self,
        height_threshold: float = 45,
        cap_value: float = 100,
        selected_indices: list[int] | None = None,
    ):
        """Initialize the feature extractor.

        Args:
            height_threshold: Threshold for height feature.
            cap_value: Cap value for height feature.
            selected_indices: Optional indices to select subset of features.
        """
        self.height_threshold = height_threshold
        self.cap_value = cap_value
        self.selected_indices = selected_indices

        # Feature names for reference (top 10 from EDA analysis)
        self.feature_names = [
            "closure_ratio",
            "compactness",
            "spread_ratio",
            "aspect_ratio",
            "edge_frac",
            "num_points",
            "height_diff",
            "horiz_var",
            "total_len",
            "perim_diag_ratio",
        ]

    def extract(self, raw_stroke: list[dict]) -> np.ndarray:
        """Extract features from a single stroke."""
        features = compute_geometric_features(
            raw_stroke,
            self.height_threshold,
            self.cap_value,
        )

        if self.selected_indices:
            features = features[self.selected_indices]

        return features

    def extract_dataset(self, data: list[dict[str, Any]],) -> np.ndarray:
        """Extract features from dataset items.

        Args:
            data: List of stroke dictionaries with 'type' and 'stroke' keys.

        Returns:
            Feature array with shape (n, feature_dim).
        """
        features = [self.extract(item["stroke"]) for item in data]
        return np.array(features, dtype=np.float32)

    @property
    def n_features(self) -> int:
        """Get number of output features."""
        if self.selected_indices:
            return len(self.selected_indices)
        return 10

    def get_selected_names(self) -> list[str]:
        """Get names of selected features."""
        if self.selected_indices:
            return [self.feature_names[i] for i in self.selected_indices]
        return self.feature_names

    def __repr__(self) -> str:
        return (
            f"GeometricFeatureExtractor(n_features={self.n_features}, "
            f"selected={self.selected_indices})"
        )
