import logging
from pathlib import Path

import numpy as np

from app.pipeline.training.base import HyperParams, TrainingResult, TrainingStrategy

log = logging.getLogger(__name__)


def _resolve_tf_device() -> str:

    import tensorflow as tf

    gpus = tf.config.list_physical_devices("GPU")
    if gpus:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        log.info("TensorFlow — GPU disponible: %s", [g.name for g in gpus])
        return "/GPU:0"

    log.info("TensorFlow — GPU no disponible, usando CPU")
    return "/CPU:0"


class TensorFlowStrategy(TrainingStrategy):
    """Entrenamiento con TensorFlow/Keras — soporta CNN, MobileNetV2, ResNet50."""

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        hyperparams: HyperParams,
        output_dir: str,
    ) -> TrainingResult:
        import tensorflow as tf
        from tensorflow import keras

        device = _resolve_tf_device()
        log.info("TensorFlow %s — device: %s — arquitectura: %s",
                 tf.__version__, device, hyperparams.architecture)

        with tf.device(device):
            model = self._build_model(hyperparams)
            model.compile(
                optimizer=keras.optimizers.Adam(
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
            )

        artifact_path = str(Path(output_dir) / "model.h5")
        model.save(artifact_path)
        log.info("Modelo TF guardado → %s", artifact_path)

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
        )

    def _build_model(self, hp: HyperParams):
        from tensorflow import keras

        if hp.architecture == "mobilenet":
            base = keras.applications.MobileNetV2(
                input_shape=(224, 224, 3), include_top=False, weights=None)
            x = keras.layers.GlobalAveragePooling2D()(base.output)
            out = keras.layers.Dense(hp.num_classes, activation="softmax")(x)
            return keras.Model(base.input, out)

        if hp.architecture == "resnet50":
            base = keras.applications.ResNet50(
                input_shape=(224, 224, 3), include_top=False, weights=None)
            x = keras.layers.GlobalAveragePooling2D()(base.output)
            out = keras.layers.Dense(hp.num_classes, activation="softmax")(x)
            return keras.Model(base.input, out)

        return keras.Sequential([
            keras.layers.Input(shape=(28, 28, 1)),
            keras.layers.Conv2D(32, 3, activation="relu", padding="same"),
            keras.layers.MaxPooling2D(),
            keras.layers.Conv2D(64, 3, activation="relu", padding="same"),
            keras.layers.MaxPooling2D(),
            keras.layers.Flatten(),
            keras.layers.Dense(128, activation="relu"),
            keras.layers.Dropout(0.3),
            keras.layers.Dense(hp.num_classes, activation="softmax"),
        ])

    def _infer_input_shape(self, hp: HyperParams) -> tuple:
        return (28, 28, 1)