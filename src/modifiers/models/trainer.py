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
        train_data: Any,
        val_data: Any = None,
        epochs: int = 100,
        batch_size: int = 32,
        class_weights: dict[int, float] | None = None,
        early_stopping_patience: int = 35,
        reduce_lr_patience: int = 5,
    ) -> dict[str, list]:
        """Train the model.

        Args:
            train_data: Keras Sequence, tf.data.Dataset, or numpy arrays.
            val_data: Validation data (Sequence, Dataset, or tuple).
            epochs: Maximum number of epochs.
            batch_size: Batch size (if using numpy arrays).
            class_weights: Optional class weights.
            early_stopping_patience: Patience for early stopping.
            reduce_lr_patience: Patience for LR reduction.

        Returns:
            Training history dictionary.
        """
        callbacks = self._create_callbacks(
            early_stopping_patience=early_stopping_patience,
            reduce_lr_patience=reduce_lr_patience,
        )

        logger.info(f"Starting training for {epochs} epochs")
        
        # Keras .fit() handles specific logic for Sequence vs Numpy vs Dataset
        history = self.model.fit(
            train_data,
            validation_data=val_data,
            epochs=epochs,
            batch_size=batch_size if not isinstance(train_data, (tf.keras.utils.Sequence, tf.data.Dataset)) else None,
            class_weight=class_weights,
            callbacks=callbacks,
            verbose=1,
        )

        self.history = history.history
        logger.info("Training complete")

        return self.history

    def evaluate(
        self,
        test_data: Any,
        batch_size: int = 32,
    ) -> dict[str, float]:
        """Evaluate model on test data.

        Args:
            test_data: Sequence, Dataset, or (x, y) tuple.
            batch_size: Batch size (for numpy arrays).

        Returns:
            Dictionary with loss and accuracy.
        """
        logger.info("Evaluating/Predicting on test data...")
        
        results = self.model.evaluate(
            test_data, 
            batch_size=batch_size if not isinstance(test_data, (tf.keras.utils.Sequence, tf.data.Dataset)) else None,
            verbose=1
        )

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

