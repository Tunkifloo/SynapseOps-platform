"""
Responsabilidad única: entrenar con TensorFlow/Keras.
CNN adaptativa al input_shape detectado por ingestion.
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.pipeline.training.base import EpochCallback, HyperParams, TrainingResult, TrainingStrategy

log = logging.getLogger(__name__)


class TensorFlowStrategy(TrainingStrategy):
    """
    Strategy TensorFlow — CNN adaptativa.
    - input_shape (28,28,1) → 2 bloques conv (MNIST-like)
    - input_shape (64,64,3) → 3 bloques conv (imágenes color)
    Detección automática de GPU/CPU via tf.config.
    """

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val:   np.ndarray,
        y_val:   np.ndarray,
        hyperparams: HyperParams,
        output_dir: str,
        X_test: Optional[np.ndarray] = None,
        y_test: Optional[np.ndarray] = None,
        on_epoch: Optional[EpochCallback] = None,
    ) -> TrainingResult:
        import tensorflow as tf

        device = self._resolve_device()
        log.info("TF %s — device=%s shape=%s classes=%d",
                 tf.__version__, device,
                 hyperparams.input_shape, hyperparams.num_classes)

        callbacks = []
        if on_epoch is not None:
            total = hyperparams.epochs
            callbacks.append(tf.keras.callbacks.LambdaCallback(
                on_epoch_end=lambda epoch, logs: on_epoch(epoch + 1, total, logs or {})))

        with tf.device(device):
            model = self._build_cnn(hyperparams)
            model.compile(
                optimizer=tf.keras.optimizers.Adam(
                    learning_rate=hyperparams.learning_rate),
                loss="sparse_categorical_crossentropy",
                metrics=["accuracy"],
            )
            history = model.fit(
                X_train, y_train,
                validation_data=(X_val, y_val),
                epochs=hyperparams.epochs,
                batch_size=hyperparams.batch_size,
                verbose=1,
                callbacks=callbacks,
            )

        # Evaluación final sobre el split de test (si lo hay).
        test_accuracy = test_loss = None
        if X_test is not None and y_test is not None and len(X_test) > 0:
            with tf.device(device):
                tl, ta = model.evaluate(X_test, y_test, verbose=0)
            test_loss, test_accuracy = float(tl), float(ta)
            log.info("Evaluación en test — loss=%.4f acc=%.4f", test_loss, test_accuracy)

        artifact_path = str(Path(output_dir) / "model.keras")
        model.save(artifact_path)
        log.info("Modelo TF guardado: %s", artifact_path)

        hist = history.history
        return TrainingResult(
            framework="tensorflow",
            history={
                "accuracy":     hist.get("accuracy", []),
                "loss":         hist.get("loss", []),
                "val_accuracy": hist.get("val_accuracy", []),
                "val_loss":     hist.get("val_loss", []),
            },
            artifact_path=artifact_path,
            final_accuracy=float(hist["accuracy"][-1]),
            final_loss=float(hist["loss"][-1]),
            test_accuracy=test_accuracy,
            test_loss=test_loss,
        )

    def _build_cnn(self, hp: HyperParams):
        import tensorflow as tf

        h = hp.input_shape[0]
        filters = [32, 64] if h <= 32 else [32, 64, 128]

        layers = [tf.keras.layers.Input(shape=hp.input_shape)]
        for f in filters:
            layers += [
                tf.keras.layers.Conv2D(f, 3, activation="relu", padding="same"),
                tf.keras.layers.MaxPooling2D(),
            ]
        layers += [
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.Dropout(0.4),
            tf.keras.layers.Dense(hp.num_classes, activation="softmax"),
        ]
        return tf.keras.Sequential(layers)

    def _resolve_device(self) -> str:
        import tensorflow as tf
        gpus = tf.config.list_physical_devices("GPU")
        if gpus:
            for gpu in gpus:
                tf.config.experimental.set_memory_growth(gpu, True)
            log.info("TF GPU: %s", [g.name for g in gpus])
            return "/GPU:0"
        log.info("TF usando CPU")
        return "/CPU:0"