"""Model training orchestration for OnePen stroke classifier."""

from pathlib import Path
from datetime import datetime

import numpy as np
from tensorflow import keras

from modifiers.utils.logging import get_logger

logger = get_logger("onepen.training")


class StrokeModelTrainer:
    """Trainer class for stroke classification model."""

    def __init__(
        self,
        model: keras.Model,
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
        self.history = None

        # Create output directories
        self.checkpoint_dir = self.output_dir / "checkpoints"
        self.log_dir = self.output_dir / "logs"
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def _build_callbacks(
        self,
        run_name: str,
        early_stopping_patience: int = 35,
        reduce_lr_patience: int = 5,
        reduce_lr_factor: float = 0.5,
        min_lr: float = 1e-6,
        use_tensorboard: bool = True,
    ) -> list[keras.callbacks.Callback]:
        """Build training callbacks."""
        callbacks = []

        # Model checkpoint - save best model
        callbacks.append(
            keras.callbacks.ModelCheckpoint(
                filepath=str(self.checkpoint_dir / f"{run_name}_best.keras"),
                monitor="val_accuracy",
                save_best_only=True,
                verbose=1,
            )
        )

        # Early stopping
        callbacks.append(
            keras.callbacks.EarlyStopping(
                monitor="val_accuracy",
                patience=early_stopping_patience,
                restore_best_weights=True,
                verbose=1,
            )
        )

        # Learning rate reduction
        callbacks.append(
            keras.callbacks.ReduceLROnPlateau(
                monitor="val_loss",
                factor=reduce_lr_factor,
                patience=reduce_lr_patience,
                min_lr=min_lr,
                verbose=1,
            )
        )

        # TensorBoard (without histogram to avoid freezes)
        if use_tensorboard:
            callbacks.append(
                keras.callbacks.TensorBoard(
                    log_dir=str(self.log_dir / run_name),
                    histogram_freq=0,
                    write_graph=False,
                    update_freq="epoch",
                )
            )

        return callbacks

    def train(
        self,
        x_train: dict | np.ndarray,
        y_train: np.ndarray,
        x_val: dict | np.ndarray,
        y_val: np.ndarray,
        epochs: int = 100,
        batch_size: int = 32,
        class_weights: dict[int, float] | None = None,
        early_stopping_patience: int = 35,
        reduce_lr_patience: int = 5,
        use_tensorboard: bool = True,
    ) -> keras.callbacks.History:
        """Train the model with numpy arrays directly.

        Args:
            x_train: Training features (dict with 'img_input' and 'feature_input').
            y_train: Training labels.
            x_val: Validation features.
            y_val: Validation labels.
            epochs: Maximum number of epochs.
            batch_size: Batch size.
            class_weights: Optional class weights for imbalanced data.
            early_stopping_patience: Patience for early stopping.
            reduce_lr_patience: Patience for LR reduction.
            use_tensorboard: Whether to use TensorBoard callback.

        Returns:
            Training history.
        """
        run_name = f"{self.experiment_name}_{datetime.now():%Y%m%d_%H%M%S}"

        callbacks = self._build_callbacks(
            run_name=run_name,
            early_stopping_patience=early_stopping_patience,
            reduce_lr_patience=reduce_lr_patience,
            use_tensorboard=use_tensorboard,
        )

        logger.info(f"Starting training for {epochs} epochs")
        logger.info(f"  Training samples: {len(y_train)}")
        logger.info(f"  Validation samples: {len(y_val)}")
        logger.info(f"  Batch size: {batch_size}")

        # Train with numpy arrays directly (like HandKey)
        self.history = self.model.fit(
            x_train,
            y_train,
            validation_data=(x_val, y_val),
            epochs=epochs,
            batch_size=batch_size,
            class_weight=class_weights,
            callbacks=callbacks,
            verbose=1,
        )

        logger.info("Training complete")
        return self.history

    def evaluate(
        self,
        x_test: dict | np.ndarray,
        y_test: np.ndarray,
        batch_size: int = 32,
    ) -> dict[str, float]:
        """Evaluate model on test data.

        Args:
            x_test: Test features.
            y_test: Test labels.
            batch_size: Batch size.

        Returns:
            Dictionary with loss and accuracy.
        """
        logger.info("Evaluating on test data...")

        results = self.model.evaluate(x_test, y_test, batch_size=batch_size, verbose=1)

        metrics = {
            "test_loss": float(results[0]),
            "test_accuracy": float(results[1]),
        }

        logger.info(f"Test loss: {metrics['test_loss']:.4f}")
        logger.info(f"Test accuracy: {metrics['test_accuracy']:.4f}")

        return metrics

    def predict(
        self,
        x: dict | np.ndarray,
        batch_size: int = 32,
    ) -> np.ndarray:
        """Get predictions.

        Args:
            x: Input features.
            batch_size: Batch size.

        Returns:
            Predicted probabilities.
        """
        return self.model.predict(x, batch_size=batch_size, verbose=0)

    def save_model(self, path: str | Path | None = None) -> Path:
        """Save the trained model.

        Args:
            path: Optional custom path. Defaults to checkpoint_dir/final_model.keras.

        Returns:
            Path where model was saved.
        """
        if path is None:
            path = self.checkpoint_dir / "final_model.keras"
        else:
            path = Path(path)

        path.parent.mkdir(parents=True, exist_ok=True)
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

        hist = self.history.history
        return {
            "best_val_accuracy": float(max(hist.get("val_accuracy", [0]))),
            "best_val_loss": float(min(hist.get("val_loss", [float("inf")]))),
            "final_train_accuracy": float(hist.get("accuracy", [0])[-1]),
            "epochs_trained": len(hist.get("accuracy", [])),
        }
