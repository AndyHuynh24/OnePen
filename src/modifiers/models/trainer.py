"""Model training orchestration."""

from pathlib import Path
from typing import Any

import tensorflow as tf
from tensorflow.keras.callbacks import (
    EarlyStopping,
    ModelCheckpoint,
    ReduceLROnPlateau,
    TensorBoard,
)
from tensorflow.keras.models import Model

from modifiers.utils.logging import get_logger

logger = get_logger("onepen.training")


class StrokeModelTrainer:
    """Trainer class for stroke classification model."""

    def __init__(
        self,
        model: Model,
        output_dir: str | Path = "outputs",
        experiment_name: str = "stroke_classifier",
    ):
        """Initialize the trainer.

        Args:
            model: Compiled Keras model.
            output_dir: Directory for outputs (checkpoints, logs).
            experiment_name: Name for this experiment.
        """
        self.model = model
        self.output_dir = Path(output_dir)
        self.experiment_name = experiment_name

        # Create output directories
        self.checkpoint_dir = self.output_dir / "checkpoints"
        self.log_dir = self.output_dir / "logs"
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        self.history: dict[str, list] | None = None

    def _create_callbacks(
        self,
        early_stopping_patience: int = 35,
        reduce_lr_patience: int = 5,
        reduce_lr_factor: float = 0.5,
        min_lr: float = 1e-6,
    ) -> list[tf.keras.callbacks.Callback]:
        """Create training callbacks.

        Args:
            early_stopping_patience: Patience for early stopping.
            reduce_lr_patience: Patience for learning rate reduction.
            reduce_lr_factor: Factor to reduce learning rate by.
            min_lr: Minimum learning rate.

        Returns:
            List of Keras callbacks.
        """
        callbacks = [
            # Save best model
            ModelCheckpoint(
                filepath=str(self.checkpoint_dir / "best_model.keras"),
                monitor="val_accuracy",
                save_best_only=True,
                verbose=1,
            ),

            # Early stopping
            EarlyStopping(
                monitor="val_accuracy",
                patience=early_stopping_patience,
                restore_best_weights=True,
                verbose=1,
            ),

            # Learning rate reduction
            ReduceLROnPlateau(
                monitor="val_loss",
                factor=reduce_lr_factor,
                patience=reduce_lr_patience,
                min_lr=min_lr,
                verbose=1,
            ),

            # TensorBoard logging
            TensorBoard(
                log_dir=str(self.log_dir / self.experiment_name),
                histogram_freq=1,
            ),
        ]

        return callbacks

    def train(
        self,
        train_dataset: Any = None,
        val_dataset: Any = None,
        X_train_img: Any = None,
        y_train: Any = None,
        X_val_img: Any = None,
        y_val: Any = None,
        X_train_feat: Any = None,
        X_val_feat: Any = None,
        epochs: int = 200,
        batch_size: int = 32,
        class_weights: dict[int, float] | None = None,
        early_stopping_patience: int = 35,
        reduce_lr_patience: int = 5,
    ) -> dict[str, list]:
        """Train the model using tf.data.Dataset or numpy arrays.

        You can either pass:
        - train_dataset + val_dataset (tf.data.Dataset) - RECOMMENDED, memory efficient
        - X_train_img + y_train + X_val_img + y_val (numpy arrays) - legacy support

        Args:
            train_dataset: tf.data.Dataset for training (recommended).
            val_dataset: tf.data.Dataset for validation (recommended).
            X_train_img: Training images (legacy, use train_dataset instead).
            y_train: Training labels (legacy).
            X_val_img: Validation images (legacy).
            y_val: Validation labels (legacy).
            X_train_feat: Training features (legacy, for hybrid models).
            X_val_feat: Validation features (legacy, for hybrid models).
            epochs: Maximum number of epochs.
            batch_size: Batch size (only used for legacy numpy mode).
            class_weights: Optional class weights for imbalanced data.
            early_stopping_patience: Patience for early stopping.
            reduce_lr_patience: Patience for LR reduction.

        Returns:
            Training history dictionary.
        """
        callbacks = self._create_callbacks(
            early_stopping_patience=early_stopping_patience,
            reduce_lr_patience=reduce_lr_patience,
        )

        # Use tf.data.Dataset if provided (recommended - memory efficient)
        if train_dataset is not None:
            logger.info(f"Starting training for {epochs} epochs")
            logger.info("  Using tf.data.Dataset (memory-efficient streaming)")

            history = self.model.fit(
                train_dataset,
                validation_data=val_dataset,
                epochs=epochs,
                class_weight=class_weights,
                callbacks=callbacks,
                verbose=1,
            )
        else:
            # Legacy: use numpy arrays directly
            logger.info(f"Starting training for {epochs} epochs")
            logger.info(f"  Train samples: {len(y_train)}")
            logger.info(f"  Val samples: {len(y_val)}")
            logger.info(f"  Batch size: {batch_size}")

            # Determine if model uses features (hybrid) or image-only
            use_features = X_train_feat is not None and len(self.model.inputs) > 1

            if use_features:
                logger.info("  Mode: hybrid (image + features)")
                train_data = {"img_input": X_train_img, "feature_input": X_train_feat}
                val_data = ({"img_input": X_val_img, "feature_input": X_val_feat}, y_val)
            else:
                logger.info("  Mode: image-only")
                train_data = X_train_img
                val_data = (X_val_img, y_val)

            history = self.model.fit(
                train_data,
                y_train,
                validation_data=val_data,
                epochs=epochs,
                batch_size=batch_size,
                class_weight=class_weights,
                callbacks=callbacks,
                verbose=1,
            )

        self.history = history.history
        logger.info("Training complete")

        return self.history

    def evaluate(
        self,
        test_dataset: Any = None,
        X_test_img: Any = None,
        y_test: Any = None,
        X_test_feat: Any = None,
    ) -> dict[str, float]:
        """Evaluate model on test data.

        Args:
            test_dataset: tf.data.Dataset for testing (recommended).
            X_test_img: Test images (legacy).
            y_test: Test labels (legacy).
            X_test_feat: Test features (legacy, for hybrid models).

        Returns:
            Dictionary with loss and accuracy.
        """
        if test_dataset is not None:
            logger.info("Evaluating on test dataset...")
            results = self.model.evaluate(test_dataset, verbose=1)
        else:
            logger.info(f"Evaluating on {len(y_test)} test samples")

            # Determine if model uses features (hybrid) or image-only
            use_features = X_test_feat is not None and len(self.model.inputs) > 1

            if use_features:
                test_data = {"img_input": X_test_img, "feature_input": X_test_feat}
            else:
                test_data = X_test_img

            results = self.model.evaluate(test_data, y_test, verbose=1)

        metrics = {
            "test_loss": results[0],
            "test_accuracy": results[1],
        }

        logger.info(f"Test loss: {metrics['test_loss']:.4f}")
        logger.info(f"Test accuracy: {metrics['test_accuracy']:.4f}")

        return metrics

    def save_model(self, path: str | Path | None = None) -> Path:
        """Save the trained model.

        Args:
            path: Optional custom path. Defaults to checkpoint_dir.

        Returns:
            Path where model was saved.
        """
        if path is None:
            path = self.checkpoint_dir / "final_model.keras"
        else:
            path = Path(path)

        self.model.save(str(path))
        logger.info(f"Model saved to {path}")

        return path

    def get_best_metrics(self) -> dict[str, float]:
        """Get best metrics from training history.

        Returns:
            Dictionary with best validation accuracy and loss.
        """
        if self.history is None:
            return {}

        return {
            "best_val_accuracy": max(self.history.get("val_accuracy", [0])),
            "best_val_loss": min(self.history.get("val_loss", [float("inf")])),
            "final_train_accuracy": self.history.get("accuracy", [0])[-1],
            "epochs_trained": len(self.history.get("accuracy", [])),
        }
