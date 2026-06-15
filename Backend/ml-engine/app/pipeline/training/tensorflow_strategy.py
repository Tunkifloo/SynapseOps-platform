"""
Responsabilidad única: entrenar con TensorFlow/Keras.
CNN adaptativa al input_shape detectado por ingestion.
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.pipeline.training import augmentation, scorecam
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
        class_names: Optional[list] = None,
    ) -> TrainingResult:
        import tensorflow as tf

        device = self._resolve_device()
        log.info("TF %s — device=%s shape=%s classes=%d",
                 tf.__version__, device,
                 hyperparams.input_shape, hyperparams.num_classes)

        # Catálogo de augmentation normalizado (idempotente; aplica preset si solo
        # viene el toggle). Se aplica vía tf.data.map → el modelo guardado queda
        # limpio (sin capas de augmentation) y carga sin problemas en el model-service.
        aug_cfg = augmentation.normalize_config(
            hyperparams.augmentation_config, hyperparams.data_augmentation)
        if aug_cfg:
            log.info("Augmentation in-graph (TF): %s", augmentation.summarize(aug_cfg))
        train_ds = self._make_dataset(X_train, y_train, hyperparams, aug_cfg)
        arch = (hyperparams.architecture or "cnn").lower()

        with tf.device(device):
            if arch == "cnn":
                model = self._build_cnn(hyperparams)
                hist = self._fit_phase(
                    model, train_ds, X_train, y_train, X_val, y_val, hyperparams,
                    hyperparams.learning_rate, hyperparams.epochs, 0,
                    hyperparams.epochs, None, on_epoch)
            else:
                # Transfer Learning en 2 fases: Feature Extraction → Fine-Tuning.
                model, base = self._build_pretrained(arch, hyperparams)
                total = hyperparams.feature_extraction_epochs + hyperparams.finetuning_epochs
                log.info("TL %s — FE %d ep (lr=%.0e) → FT %d ep (lr=%.0e, descongela %d capas)",
                         arch, hyperparams.feature_extraction_epochs, hyperparams.feature_extraction_lr,
                         hyperparams.finetuning_epochs, hyperparams.finetuning_lr,
                         hyperparams.unfreeze_layers)
                h1 = self._fit_phase(
                    model, train_ds, X_train, y_train, X_val, y_val, hyperparams,
                    hyperparams.feature_extraction_lr, hyperparams.feature_extraction_epochs,
                    0, total, "FE", on_epoch)
                h2 = {}
                if hyperparams.finetuning_epochs > 0:
                    self._unfreeze_tf(base, hyperparams.unfreeze_layers)
                    h2 = self._fit_phase(
                        model, train_ds, X_train, y_train, X_val, y_val, hyperparams,
                        hyperparams.finetuning_lr, hyperparams.finetuning_epochs,
                        hyperparams.feature_extraction_epochs, total, "FT", on_epoch)
                hist = {k: list(h1.get(k, [])) + list(h2.get(k, []))
                        for k in set(h1) | set(h2)}

        # Predicciones para métricas avanzadas (item 7) — train y val.
        with tf.device(device):
            train_proba = model.predict(X_train, verbose=0)
            val_proba = model.predict(X_val, verbose=0)
        train_pred = train_proba.argmax(axis=1)
        train_true = np.asarray(y_train)
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

        # Interpretabilidad Score-CAM (galería sobre el held-out; best-effort).
        cam_X, cam_y = ((X_test, y_test) if X_test is not None and len(X_test) > 0
                        else (X_val, y_val))
        with tf.device(device):
            gallery = scorecam.generate("tensorflow", model, cam_X, cam_y,
                                        class_names, output_dir)

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
            train_true=train_true, train_pred=train_pred, train_proba=train_proba,
            val_true=np.asarray(y_val), val_pred=val_pred, val_proba=val_proba,
            test_true=test_true, test_pred=test_pred, test_proba=test_proba,
            interpretability_path=gallery,
        )

    def _make_dataset(self, X_train, y_train, hp: HyperParams, aug_cfg: dict):
        """tf.data con augmentation aplicada en map; None si no hay técnicas activas."""
        if not aug_cfg:
            return None
        import tensorflow as tf
        return (
            tf.data.Dataset.from_tensor_slices((X_train, y_train))
            .shuffle(min(len(X_train), 10_000))
            .batch(hp.batch_size)
            .map(self._augment_fn(aug_cfg, hp.input_shape[-1]),
                 num_parallel_calls=tf.data.AUTOTUNE)
            .prefetch(tf.data.AUTOTUNE)
        )

    def _fit_phase(self, model, train_ds, X_train, y_train, X_val, y_val,
                   hp: HyperParams, lr: float, epochs: int, offset: int,
                   total: int, phase: "str | None", on_epoch) -> dict:
        """Compila con `lr` y entrena `epochs`. Reporta epochs continuas (offset/total)
        y la fase (FE/FT) en el callback. Devuelve el history como dict plano."""
        import tensorflow as tf
        if epochs <= 0:
            return {}
        model.compile(
            optimizer=self._build_optimizer(hp, lr),
            loss="sparse_categorical_crossentropy",
            metrics=["accuracy"],
        )
        cbs = []
        if on_epoch is not None:
            extra = {"phase": phase} if phase else {}
            cbs.append(tf.keras.callbacks.LambdaCallback(
                on_epoch_end=lambda e, logs: on_epoch(
                    offset + e + 1, total, {**(logs or {}), **extra})))
        if hp.early_stopping:
            monitor = "val_accuracy" if hp.es_monitor == "val_accuracy" else "val_loss"
            cbs.append(tf.keras.callbacks.EarlyStopping(
                monitor=monitor, patience=max(1, hp.es_patience),
                restore_best_weights=True, verbose=1))
        if train_ds is not None:
            h = model.fit(train_ds, validation_data=(X_val, y_val),
                          epochs=epochs, verbose=1, callbacks=cbs)
        else:
            h = model.fit(X_train, y_train, validation_data=(X_val, y_val),
                          epochs=epochs, batch_size=hp.batch_size, verbose=1, callbacks=cbs)
        return h.history

    def _build_pretrained(self, arch: str, hp: HyperParams):
        """Backbone ImageNet (include_top=False) + cabeza nueva. Devuelve (model, base).
        El backbone arranca congelado (feature extraction). Entrada en [0,1]; cada
        familia recibe el reescalado serializable que espera (capas Rescaling nativas
        → el .keras carga sin código custom en el model-service)."""
        import tensorflow as tf
        name = arch.lower()
        reg = tf.keras.regularizers.l2(hp.l2) if hp.l2 and hp.l2 > 0 else None
        inp = tf.keras.layers.Input(shape=hp.input_shape)
        if name == "efficientnet":
            x = tf.keras.layers.Rescaling(255.0)(inp)   # EfficientNet preprocesa internamente
            base = tf.keras.applications.EfficientNetB0(
                include_top=False, weights="imagenet", input_tensor=x)
        elif name == "mobilenet":
            x = tf.keras.layers.Rescaling(2.0, offset=-1.0)(inp)   # [0,1] → [-1,1]
            base = tf.keras.applications.MobileNetV2(
                include_top=False, weights="imagenet", input_tensor=x)
        elif name == "resnet":
            x = tf.keras.layers.Rescaling(2.0, offset=-1.0)(inp)   # [-1,1] (FT lo ajusta)
            base = tf.keras.applications.ResNet50(
                include_top=False, weights="imagenet", input_tensor=x)
        else:
            raise ValueError(f"Backbone no soportado: {arch}")
        base.trainable = False
        y = tf.keras.layers.GlobalAveragePooling2D()(base.output)
        y = tf.keras.layers.Dense(256, activation="relu", kernel_regularizer=reg)(y)
        y = tf.keras.layers.Dropout(hp.dropout)(y)
        out = tf.keras.layers.Dense(hp.num_classes, activation="softmax")(y)
        model = tf.keras.Model(inp, out)
        log.info("Backbone %s instanciado (params=%d).", name, model.count_params())
        return model, base

    def _unfreeze_tf(self, base, n: int) -> None:
        """Descongela las últimas `n` capas del backbone (BatchNorm permanece congelado
        para estabilidad durante el fine-tuning)."""
        import tensorflow as tf
        base.trainable = True
        cutoff = max(0, len(base.layers) - max(1, n))
        for i, layer in enumerate(base.layers):
            if i < cutoff or isinstance(layer, tf.keras.layers.BatchNormalization):
                layer.trainable = False

    def _build_optimizer(self, hp: HyperParams, lr: "float | None" = None):
        import tensorflow as tf
        lr = lr if lr is not None else hp.learning_rate
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
        reg = tf.keras.regularizers.l2(hp.l2) if hp.l2 and hp.l2 > 0 else None

        layers = [tf.keras.layers.Input(shape=hp.input_shape)]

        # Nota: la augmentation NO se embebe en el modelo; se aplica en el pipeline
        # tf.data (_augment_fn) para no contaminar el artefacto .keras guardado.
        for f in filters:
            layers.append(tf.keras.layers.Conv2D(f, 3, padding="same",
                                                 activation=None if hp.batch_norm else "relu",
                                                 kernel_regularizer=reg))
            if hp.batch_norm:
                layers.append(tf.keras.layers.BatchNormalization())
                layers.append(tf.keras.layers.Activation("relu"))
            layers.append(tf.keras.layers.MaxPooling2D())

        layers += [
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(128, activation="relu", kernel_regularizer=reg),
            tf.keras.layers.Dropout(hp.dropout),
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