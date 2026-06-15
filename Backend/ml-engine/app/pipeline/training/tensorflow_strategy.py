"""
Responsabilidad única: entrenar con TensorFlow/Keras.
CNN adaptativa al input_shape detectado por ingestion.
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.pipeline.training import augmentation
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
        if hyperparams.early_stopping:
            monitor = "val_accuracy" if hyperparams.es_monitor == "val_accuracy" else "val_loss"
            callbacks.append(tf.keras.callbacks.EarlyStopping(
                monitor=monitor, patience=max(1, hyperparams.es_patience),
                restore_best_weights=True, verbose=1))
            log.info("EarlyStopping activo — monitor=%s patience=%d", monitor, hyperparams.es_patience)

        # Catálogo de augmentation normalizado (idempotente; aplica preset si solo
        # viene el toggle). Se aplica vía tf.data.map → el modelo guardado queda
        # limpio (sin capas de augmentation) y carga sin problemas en el model-service.
        aug_cfg = augmentation.normalize_config(
            hyperparams.augmentation_config, hyperparams.data_augmentation)

        with tf.device(device):
            model = self._build_cnn(hyperparams)
            model.compile(
                optimizer=self._build_optimizer(hyperparams),
                loss="sparse_categorical_crossentropy",
                metrics=["accuracy"],
            )
            if aug_cfg:
                log.info("Augmentation in-graph (TF): %s", augmentation.summarize(aug_cfg))
                train_ds = (
                    tf.data.Dataset.from_tensor_slices((X_train, y_train))
                    .shuffle(min(len(X_train), 10_000))
                    .batch(hyperparams.batch_size)
                    .map(self._augment_fn(aug_cfg, hyperparams.input_shape[-1]),
                         num_parallel_calls=tf.data.AUTOTUNE)
                    .prefetch(tf.data.AUTOTUNE)
                )
                history = model.fit(
                    train_ds, validation_data=(X_val, y_val),
                    epochs=hyperparams.epochs, verbose=1, callbacks=callbacks)
            else:
                history = model.fit(
                    X_train, y_train,
                    validation_data=(X_val, y_val),
                    epochs=hyperparams.epochs,
                    batch_size=hyperparams.batch_size,
                    verbose=1,
                    callbacks=callbacks,
                )

        # Predicciones para métricas avanzadas (item 7).
        with tf.device(device):
            val_proba = model.predict(X_val, verbose=0)
        val_pred = val_proba.argmax(axis=1)

        test_accuracy = test_loss = None
        test_true = test_pred = test_proba = None
        if X_test is not None and y_test is not None and len(X_test) > 0:
            with tf.device(device):
                tl, ta = model.evaluate(X_test, y_test, verbose=0)
                test_proba = model.predict(X_test, verbose=0)
            test_pred = test_proba.argmax(axis=1)
            test_true = np.asarray(y_test)
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
            final_accuracy=float(hist.get("val_accuracy", hist.get("accuracy", [0]))[-1]),
            final_loss=float(hist.get("val_loss", hist.get("loss", [0]))[-1]),
            test_accuracy=test_accuracy,
            test_loss=test_loss,
            val_true=np.asarray(y_val), val_pred=val_pred, val_proba=val_proba,
            test_true=test_true, test_pred=test_pred, test_proba=test_proba,
        )

    def _build_optimizer(self, hp: HyperParams):
        import tensorflow as tf
        lr = hp.learning_rate
        opt = (hp.optimizer or "adam").lower()
        if opt == "adamw":
            return tf.keras.optimizers.AdamW(learning_rate=lr)
        if opt == "sgd":
            return tf.keras.optimizers.SGD(learning_rate=lr, momentum=0.9)
        if opt == "rmsprop":
            return tf.keras.optimizers.RMSprop(learning_rate=lr)
        return tf.keras.optimizers.Adam(learning_rate=lr)

    def _build_cnn(self, hp: HyperParams):
        import tensorflow as tf

        h = hp.input_shape[0]
        filters = [32, 64] if h <= 32 else [32, 64, 128]

        layers = [tf.keras.layers.Input(shape=hp.input_shape)]

        # Nota: la augmentation NO se embebe en el modelo; se aplica en el pipeline
        # tf.data (_augment_fn) para no contaminar el artefacto .keras guardado.
        for f in filters:
            layers.append(tf.keras.layers.Conv2D(f, 3, padding="same",
                                                 activation=None if hp.batch_norm else "relu"))
            if hp.batch_norm:
                layers.append(tf.keras.layers.BatchNormalization())
                layers.append(tf.keras.layers.Activation("relu"))
            layers.append(tf.keras.layers.MaxPooling2D())

        layers += [
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.Dropout(0.4),
            tf.keras.layers.Dense(hp.num_classes, activation="softmax"),
        ]
        return tf.keras.Sequential(layers)

    def _augment_fn(self, cfg: dict, channels: int):
        """Construye la función de augmentation para tf.data.map a partir del catálogo.

        Geometría/foto vía capas preprocessing nativas (no se guardan en el modelo);
        saturación/nitidez/ruido vía ops de tf.image — todas paritarias con PyTorch.
        """
        import tensorflow as tf

        geo = []
        if "flipH" in cfg:
            geo.append(tf.keras.layers.RandomFlip("horizontal"))
        if "flipV" in cfg:
            geo.append(tf.keras.layers.RandomFlip("vertical"))
        if "rotation" in cfg:
            geo.append(tf.keras.layers.RandomRotation(cfg["rotation"]["maxDeg"] / 360.0))
        if "translation" in cfg:
            f = cfg["translation"]["fraction"]
            geo.append(tf.keras.layers.RandomTranslation(f, f))
        if "zoom" in cfg:
            geo.append(tf.keras.layers.RandomZoom(cfg["zoom"]["scale"]))
        if "brightness" in cfg:
            geo.append(tf.keras.layers.RandomBrightness(
                cfg["brightness"]["factor"], value_range=(0.0, 1.0)))
        if "contrast" in cfg:
            geo.append(tf.keras.layers.RandomContrast(cfg["contrast"]["factor"]))
        aug_seq = tf.keras.Sequential(geo) if geo else None

        sat = cfg.get("saturation")
        shp = cfg.get("sharpness")
        noise = cfg.get("gaussianNoise")
        if sat is not None and channels != 3:
            log.info("Saturación omitida: requiere 3 canales (canales=%d).", channels)
            sat = None

        def fn(x, y):
            if aug_seq is not None:
                x = aug_seq(x, training=True)
            if sat is not None:
                x = tf.image.random_saturation(
                    x, max(0.0, 1.0 - sat["factor"]), 1.0 + sat["factor"])
            if shp is not None:
                blur = tf.nn.avg_pool2d(x, ksize=3, strides=1, padding="SAME")
                x = x + (x - blur) * (shp["intensity"] - 1.0)   # unsharp mask
            if noise is not None:
                x = x + tf.random.normal(tf.shape(x), mean=0.0, stddev=noise["std"])
            return tf.clip_by_value(x, 0.0, 1.0), y

        return fn

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