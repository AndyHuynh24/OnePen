"""Data generator for stroke classification training."""

import math
from typing import Any

import numpy as np
import tensorflow as tf
from tensorflow.keras.utils import Sequence


class StrokeDataGenerator(Sequence):
    """
    Keras Sequence generator for stroke data.
    
    This replaces tf.data.Dataset for better compatibility on macOS (Metal/MPS)
    and easier debugging. It supports both hybrid (image + features) and 
    image-only models.
    """
    
    def __init__(
        self,
        images: np.ndarray,
        labels: np.ndarray,
        features: np.ndarray | None = None,
        batch_size: int = 32,
        shuffle: bool = True,
    ):
        """
        Initialize the generator.

        Args:
            images: Image data array (N, H, W, C).
            labels: Label array (N,).
            features: Optional feature array (N, D).
            batch_size: Batch size.
            shuffle: Whether to shuffle data at the start of each epoch.
        """
        super().__init__()  # Required for Keras Sequence on newer TF versions
        self.images = images
        self.labels = labels
        self.features = features
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.indices = np.arange(len(self.images))
        
        if self.shuffle:
            np.random.shuffle(self.indices)
            
    def __len__(self) -> int:
        """Number of batches per epoch."""
        return math.ceil(len(self.images) / self.batch_size)
    
    def __getitem__(self, idx: int) -> tuple[dict[str, np.ndarray] | np.ndarray, np.ndarray]:
        """Get a batch of data."""
        if idx == 0:
            print(f"[Generator] Fetching batch 0/{len(self)}", flush=True)

        start = idx * self.batch_size
        end = min(start + self.batch_size, len(self.images))
        batch_indices = self.indices[start:end]

        batch_images = self.images[batch_indices].astype(np.float32)
        batch_labels = self.labels[batch_indices]

        if self.features is not None:
            batch_features = self.features[batch_indices].astype(np.float32)
            return (
                {"img_input": batch_images, "feature_input": batch_features},
                batch_labels,
            )
        else:
            return batch_images, batch_labels
            
    def on_epoch_end(self):
        """Shuffle indices after each epoch."""
        if self.shuffle:
            np.random.shuffle(self.indices)
