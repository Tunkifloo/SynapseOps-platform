"""
Responsabilidad única: entrenar con TensorFlow/Keras.
CNN adaptativa al input_shape detectado por ingestion.
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.pipeline.training import augmentation, scorecam
from app.pipeline.training.base import (
    EpochCallback, EventCallback, HyperParams, PhaseCallback, TrainingResult, TrainingStrategy,
)

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
        on_phase: Optional[PhaseCallback] = None,
        on_event: Optional[EventCallback] = None,
        quick: bool = False,
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
        # El dataset puede venir uint8 (0-255) para ahorrar RAM. Se castea a float [0,1]
        # POR LOTE en tf.data (scale=255); float (builtins/zscore) → tal cual (scale=1).
        scale = 255.0 if X_train.dtype == np.uint8 else 1.0
        train_ds = self._make_dataset(X_train, y_train, hyperparams, aug_cfg, scale)
        # Validación como tf.data por lotes (cast por lote) en vez de un array float COMPLETO:
        # a 160px+ el `X_val.astype(float32)` residente sumaba GB y, junto con la duplicación
        # del train, disparaba el OOM. Ahora val nunca se materializa entero en float.
        val_ds = self._labeled_ds(X_val, y_val, hyperparams.batch_size, scale)
        arch = (hyperparams.architecture or "cnn").lower()

        with tf.device(device):
            if arch == "cnn":
                model = self._build_cnn(hyperparams)
                hist = self._fit_phase(
                    model, train_ds, val_ds, hyperparams,
                    hyperparams.learning_rate, hyperparams.epochs, 0,
                    hyperparams.epochs, None, on_epoch)
            else:
                # Transfer Learning en 2 fases: Feature Extraction → Fine-Tuning.
                model, base, extractor, head_model = self._build_pretrained(arch, hyperparams)
                fe_ep = hyperparams.feature_extraction_epochs
                ft_ep = hyperparams.finetuning_epochs
                total = fe_ep + ft_ep
                log.info("TL %s — FE %d ep (lr=%.0e) → FT %d ep (lr=%.0e, descongela %d capas)",
                         arch, fe_ep, hyperparams.feature_extraction_lr,
                         ft_ep, hyperparams.finetuning_lr, hyperparams.unfreeze_layers)
                if on_phase is not None:
                    on_phase({"phase": "FE", "epochs": fe_ep,
                              "lr": hyperparams.feature_extraction_lr})
                # ── FE: caché de embeddings (solo sin augmentation) ──────────────
                # Backbone congelado → los embeddings son deterministas: se calculan UNA vez
                # (no por época) y se entrena solo la cabeza → mucho menos cómputo/memoria.
                # Con augmentation las imágenes cambian por época → no se pueden cachear.
                if fe_ep <= 0:
                    h1 = {}
                elif not aug_cfg:
                    emb_train = extractor.predict(
                        self._predict_ds(X_train, hyperparams.batch_size, scale), verbose=0)
                    emb_val = extractor.predict(
                        self._predict_ds(X_val, hyperparams.batch_size, scale), verbose=0)
                    emb_ds = (tf.data.Dataset.from_tensor_slices((emb_train, y_train))
                              .shuffle(min(len(emb_train), 10_000))
                              .batch(hyperparams.batch_size).prefetch(tf.data.AUTOTUNE))
                    log.info("FE con caché de embeddings (dim=%d; backbone no se re-ejecuta).",
                             emb_train.shape[-1])
                    # Embeddings pequeños (N×D) → validación como tupla directa a Keras.
                    h1 = self._fit_phase(head_model, emb_ds, (emb_val, y_val), hyperparams,
                                         hyperparams.feature_extraction_lr, fe_ep, 0, total,
                                         "FE", on_epoch)
                    del emb_train, emb_val, emb_ds
                else:
                    h1 = self._fit_phase(model, train_ds, val_ds, hyperparams,
                                         hyperparams.feature_extraction_lr, fe_ep, 0, total,
                                         "FE", on_epoch)
                # ── FT: imágenes crudas (los gradientes fluyen por el backbone) ──
                h2 = {}
                if ft_ep > 0:
                    self._unfreeze_tf(base, hyperparams.unfreeze_layers)
                    if on_phase is not None:
                        on_phase({"phase": "FT", "epochs": ft_ep,
                                  "lr": hyperparams.finetuning_lr,
                                  "unfreeze": hyperparams.unfreeze_layers})
                    h2 = self._fit_phase(model, train_ds, val_ds, hyperparams,
                                         hyperparams.finetuning_lr, ft_ep, fe_ep, total,
                                         "FT", on_epoch)
                hist = {k: list(h1.get(k, [])) + list(h2.get(k, []))
                        for k in set(h1) | set(h2)}

        # HPO (quick): basta el history de validación para puntuar el candidato. Se omiten
        # predicciones completas, test, Score-CAM y el guardado del artefacto (caros).
        if quick:
            return TrainingResult(
                framework="tensorflow",
                history={
                    "accuracy":     hist.get("accuracy", []),
                    "loss":         hist.get("loss", []),
                    "val_accuracy": hist.get("val_accuracy", []),
                    "val_loss":     hist.get("val_loss", []),
                },
                artifact_path="",
                final_accuracy=float(hist.get("val_accuracy", hist.get("accuracy", [0]))[-1]),
                final_loss=float(hist.get("val_loss", hist.get("loss", [0]))[-1]),
            )

        # Eventos de monitoreo (solo entreno final; en HPO on_event es None): si el Early
        # Stopping intervino se informa la parada + restauración de pesos, y se anuncia el
        # inicio de la etapa de evaluación.
        if on_event is not None:
            arch_l = (hyperparams.architecture or "cnn").lower()
            configured = (hyperparams.feature_extraction_epochs + hyperparams.finetuning_epochs) \
                if arch_l != "cnn" else hyperparams.epochs
            actual = len(hist.get("loss", []))
            if hyperparams.early_stopping and actual < configured:
                on_event(
                    f"Early Stopping: entrenamiento detenido en la epoch {actual} de {configured} "
                    f"(sin mejora de {hyperparams.es_monitor}); se restauraron los mejores pesos.",
                    "INFO")
            on_event("Evaluación: midiendo el modelo en validación y test ciego (datos no vistos)…",
                     "INFO")

        # Predicciones para métricas avanzadas (item 7). TODO por lotes vía tf.data (cast por
        # lote) → ni train ni val ni test se materializan enteros en float (evita el pico de
        # memoria que disparaba el OOM en el post-entrenamiento).
        with tf.device(device):
            train_proba = model.predict(
                self._predict_ds(X_train, hyperparams.batch_size, scale), verbose=0)
            val_proba = model.predict(
                self._predict_ds(X_val, hyperparams.batch_size, scale), verbose=0)
        train_pred = train_proba.argmax(axis=1)
        train_true = np.asarray(y_train)
        val_pred = val_proba.argmax(axis=1)

        test_accuracy = test_loss = None
        test_true = test_pred = test_proba = None
        if X_test is not None and y_test is not None and len(X_test) > 0:
            with tf.device(device):
                tl, ta = model.evaluate(
                    self._labeled_ds(X_test, y_test, hyperparams.batch_size, scale), verbose=0)
                test_proba = model.predict(
                    self._predict_ds(X_test, hyperparams.batch_size, scale), verbose=0)
            test_pred = test_proba.argmax(axis=1)
            test_true = np.asarray(y_test)
            test_loss, test_accuracy = float(tl), float(ta)
            log.info("Evaluación en test — loss=%.4f acc=%.4f", test_loss, test_accuracy)

        artifact_path = str(Path(output_dir) / "model.keras")
        model.save(artifact_path)
        log.info("Modelo TF guardado: %s", artifact_path)

        # Interpretabilidad Score-CAM (galería sobre el held-out; best-effort).
        if on_event is not None:
            on_event("Interpretabilidad: generando la galería Score-CAM (mapas de activación)…", "INFO")
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

    def _make_dataset(self, X_train, y_train, hp: HyperParams, aug_cfg: dict, scale: float):
        """tf.data de entrenamiento desde un GENERADOR sobre el array numpy: castea
        uint8→[0,1] POR LOTE (scale=255; float→1) y, si hay catálogo, aplica augmentation.

        Memoria: `from_generator` lee fila a fila del numpy SIN copiar el array a un tensor
        constante de TF — que es lo que hacía `from_tensor_slices` y DUPLICABA el train en
        RAM (a 160px eran ~4 GB extra → disparaba el OOM). Ahora el train vive una sola vez
        (el numpy del bundle) y el dataset solo retiene el buffer de shuffle + el lote."""
        import tensorflow as tf
        inv = 1.0 / scale
        dtype = tf.uint8 if X_train.dtype == np.uint8 else tf.float32
        sig = (tf.TensorSpec(shape=X_train.shape[1:], dtype=dtype),
               tf.TensorSpec(shape=(), dtype=tf.int64))

        def gen():
            for i in range(len(X_train)):
                yield X_train[i], y_train[i]

        # Buffer de shuffle ACOTADO por memoria (~0.5 GB): a 160px float32 una imagen ocupa
        # ~0.3 MB → 10 000 elementos serían ~3 GB de buffer (disparaba picos de RAM). Se escala
        # al tamaño/dtype real de cada muestra (uint8 admite más elementos que float32).
        per_img_bytes = int(X_train[0].nbytes) if len(X_train) else 1
        buf = min(len(X_train), 10_000, max(1_000, int(0.5e9 / max(1, per_img_bytes))))

        ds = (
            tf.data.Dataset.from_generator(gen, output_signature=sig)
            .shuffle(buf)
            .batch(hp.batch_size)
            .map(lambda x, yy: (tf.cast(x, tf.float32) * inv, yy),
                 num_parallel_calls=tf.data.AUTOTUNE)
        )
        if aug_cfg:
            ds = ds.map(self._augment_fn(aug_cfg, hp.input_shape[-1]),
                        num_parallel_calls=tf.data.AUTOTUNE)
        return ds.prefetch(tf.data.AUTOTUNE)

    def _labeled_ds(self, X, y, batch: int, scale: float):
        """tf.data CON etiquetas para validación/evaluación (sin shuffle), desde generador:
        castea uint8→[0,1] por lote. Evita materializar el split entero en float (lo que
        usaban `validation_data=(Xv_f, y)` y `evaluate(Xte_f, y)`)."""
        import tensorflow as tf
        inv = 1.0 / scale
        sig = (tf.TensorSpec(shape=X.shape[1:],
                             dtype=tf.uint8 if X.dtype == np.uint8 else tf.float32),
               tf.TensorSpec(shape=(), dtype=tf.int64))

        def gen():
            for i in range(len(X)):
                yield X[i], y[i]

        return (
            tf.data.Dataset.from_generator(gen, output_signature=sig)
            .batch(batch)
            .map(lambda xb, yb: (tf.cast(xb, tf.float32) * inv, yb),
                 num_parallel_calls=tf.data.AUTOTUNE)
            .prefetch(tf.data.AUTOTUNE)
        )

    def _predict_ds(self, X, batch: int, scale: float):
        """tf.data para inferencia (sin shuffle/labels) desde generador: castea uint8→[0,1]
        por lote SIN copiar X a un tensor constante (mismo motivo de memoria que _make_dataset)."""
        import tensorflow as tf
        inv = 1.0 / scale
        sig = tf.TensorSpec(shape=X.shape[1:],
                            dtype=tf.uint8 if X.dtype == np.uint8 else tf.float32)

        def gen():
            for i in range(len(X)):
                yield X[i]

        return (
            tf.data.Dataset.from_generator(gen, output_signature=sig)
            .batch(batch)
            .map(lambda x: tf.cast(x, tf.float32) * inv, num_parallel_calls=tf.data.AUTOTUNE)
            .prefetch(tf.data.AUTOTUNE)
        )

    def _fit_phase(self, model, train_ds, val_data,
                   hp: HyperParams, lr: float, epochs: int, offset: int,
                   total: int, phase: "str | None", on_epoch) -> dict:
        """Compila con `lr` y entrena `epochs` desde el tf.data (cast por lote). Reporta
        epochs continuas (offset/total) y la fase (FE/FT). `val_data` = validación como
        tf.data por lotes (imágenes) o tupla (embeddings, y); se pasa tal cual a Keras."""
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
            if hp.es_monitor == "both":
                cbs.append(self._dual_early_stopping(max(1, hp.es_patience)))
            else:
                monitor = "val_accuracy" if hp.es_monitor == "val_accuracy" else "val_loss"
                cbs.append(tf.keras.callbacks.EarlyStopping(
                    monitor=monitor, patience=max(1, hp.es_patience),
                    restore_best_weights=True, verbose=1))
        h = model.fit(train_ds, validation_data=val_data,
                      epochs=epochs, verbose=1, callbacks=cbs)
        return h.history

    def _dual_early_stopping(self, patience: int):
        """EarlyStopping que vigila val_loss (mín) Y val_accuracy (máx) a la vez:
        cuenta como mejora si CUALQUIERA mejora; para solo cuando NINGUNA mejora
        durante `patience` épocas. Restaura los mejores pesos al terminar."""
        import tensorflow as tf

        class _Dual(tf.keras.callbacks.Callback):
            def __init__(self, patience):
                super().__init__()
                self.patience = patience
                self.best_loss = None
                self.best_acc = None
                self.wait = 0
                self.best_w = None

            def on_epoch_end(self, epoch, logs=None):
                logs = logs or {}
                vl, va = logs.get("val_loss"), logs.get("val_accuracy")
                improved = False
                if vl is not None and (self.best_loss is None or vl < self.best_loss):
                    self.best_loss = vl
                    improved = True
                if va is not None and (self.best_acc is None or va > self.best_acc):
                    self.best_acc = va
                    improved = True
                if improved:
                    self.wait = 0
                    self.best_w = self.model.get_weights()
                else:
                    self.wait += 1
                    if self.wait >= self.patience:
                        self.model.stop_training = True

            def on_train_end(self, logs=None):
                if self.best_w is not None:
                    self.model.set_weights(self.best_w)

        return _Dual(patience)

    def _build_pretrained(self, arch: str, hp: HyperParams):
        """Backbone ImageNet (include_top=False) + cabeza nueva.
        Devuelve (full, base, extractor, head_model):
          - full      : modelo completo imágenes → softmax (para Fine-Tuning).
          - base      : el backbone (para descongelar en FT).
          - extractor : imágenes → embedding (backbone congelado + GAP), para cachear FE.
          - head_model: embedding → softmax, REUSANDO las mismas capas Dense/Dropout que
                        `full` (pesos compartidos por referencia → entrenar la cabeza sobre
                        embeddings actualiza `full`, así el FT continúa desde ahí).
        El backbone arranca congelado. Cada familia recibe el reescalado serializable que
        espera (capas Rescaling nativas → el .keras carga sin código custom)."""
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
        # Capas de la cabeza como OBJETOS reutilizables (pesos compartidos entre full y head).
        gap = tf.keras.layers.GlobalAveragePooling2D()
        d1 = tf.keras.layers.Dense(256, activation="relu", kernel_regularizer=reg)
        drop = tf.keras.layers.Dropout(hp.dropout)
        d2 = tf.keras.layers.Dense(hp.num_classes, activation="softmax")

        pooled = gap(base.output)                       # (None, D) — embedding
        out = d2(drop(d1(pooled)))
        full = tf.keras.Model(inp, out)
        extractor = tf.keras.Model(inp, pooled)         # comparte backbone+GAP con full

        emb_in = tf.keras.layers.Input(shape=(pooled.shape[-1],))
        head_model = tf.keras.Model(emb_in, d2(drop(d1(emb_in))))   # reusa d1/drop/d2

        log.info("Backbone %s instanciado (params=%d, embedding=%d).",
                 name, full.count_params(), int(pooled.shape[-1]))
        return full, base, extractor, head_model

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
            # memory_growth: TF NO acapara el 100% de la VRAM al iniciar (evita OOM por
            # preasignación) y crece bajo demanda → aprovecha la GPU sin desperdiciar. Debe
            # fijarse antes de inicializar el GPU; en jobs en serie el 2º run ya lo tiene
            # inicializado → lanza RuntimeError, que se ignora (ya quedó configurado).
            for gpu in gpus:
                try:
                    tf.config.experimental.set_memory_growth(gpu, True)
                except RuntimeError as e:
                    log.debug("set_memory_growth ya aplicado / GPU inicializado: %s", e)
            log.info("TF GPU: %s", [g.name for g in gpus])
            return "/GPU:0"
        log.info("TF usando CPU")
        return "/CPU:0"