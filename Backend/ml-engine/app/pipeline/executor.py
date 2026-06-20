"""
Responsabilidad única: orquestar el pipeline MLOps.
Template Method — define los pasos fijos, delega en estrategias.
No conoce detalles de carga, preproceso ni frameworks.
"""
import gc
import json
import logging
import shutil
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import mlflow
import numpy as np

from app.config import settings
from app.infra.mlflow_client import MLflowFacade
from app.kafka.producer import LogProducer
from app.pipeline import drift
from app.pipeline.training import augmentation, balancing
from app.pipeline.training.ingestion import load_dataset, MAX_IMAGES
from app.pipeline.training.base import HyperParams, TrainingResult
from app.pipeline.training.metrics import (
    compute_classification_metrics, confusion_matrix_payload,
)
from app.pipeline.training.tensorflow_strategy import TensorFlowStrategy
from app.pipeline.training.pytorch_strategy import PyTorchStrategy

log = logging.getLogger(__name__)


def _compute_overfit_warning(result: TrainingResult, bundle) -> dict | None:
    """Detecta overfitting comparando train vs validation accuracy."""
    if not result.history.get("accuracy") or not result.history.get("val_accuracy"):
        return None
    train_acc = float(result.history["accuracy"][-1])
    val_acc = float(result.history["val_accuracy"][-1])
    gap = train_acc - val_acc
    if gap > 0.15:
        return {
            "gap": round(float(gap), 4),
            "train_accuracy": round(train_acc, 4),
            "val_accuracy": round(val_acc, 4),
            "severity": "high" if gap > 0.25 else "moderate",
            "message": f"Posible overfitting detectado: diferencia train/val de {gap:.1%}. "
                       f"Considera aumentar data augmentation, reducir epochs, o añadir dropout.",
        }
    if gap > 0.08:
        return {
            "gap": round(float(gap), 4),
            "train_accuracy": round(train_acc, 4),
            "val_accuracy": round(val_acc, 4),
            "severity": "mild",
            "message": f"Ligera diferencia entre train y validation ({gap:.1%}). "
                       f"Monitorea epochs futuras.",
        }
    return None


@dataclass
class PipelineJob:
    execution_id: str
    pipeline_id:  str
    workspace_id: str
    dataset_path: str
    framework:    str   = "tensorflow"
    architecture: str   = "cnn"
    epochs:       int   = 5
    batch_size:   int   = 32
    learning_rate: float = 0.001
    num_classes:  int   = 10
    model_name:   str   = "synapseops_model"
    preprocessing_strategy: str = "normalization"
    image_size:   "int | None" = None   # nodo Preprocesamiento (resize)
    train_ratio:  "int | None" = None   # nodo Split (% entrenamiento)
    # ── Preprocesamiento / Entrenamiento avanzado (item 6) ───────────────────
    normalization:     str  = "minmax"   # minmax | zscore | rescale
    data_augmentation: bool = False
    # Catálogo granular de augmentation (anidado). Viaja como JSON-string o dict.
    augmentation_config: dict = field(default_factory=dict)
    # Balanceo de clases (nodo Preprocesamiento).
    class_balancing:   str  = "off"       # off | oversample | undersample | hybrid
    balance_threshold: int  = 40          # % de desbalance tolerado (10–80)
    optimizer:         str  = "adam"      # adam | adamw | sgd | rmsprop
    batch_norm:        bool = False
    early_stopping:    bool = False
    es_patience:       int  = 3
    es_monitor:        str  = "val_loss"  # val_loss | val_accuracy
    # ── Regularización + Transfer Learning ────────────────────────────────────
    dropout:           float = 0.4
    l2:                float = 0.0
    feature_extraction_epochs: int   = 5
    feature_extraction_lr:     float = 1e-3
    finetuning_epochs:         int   = 10
    finetuning_lr:             float = 1e-5
    unfreeze_layers:           int   = 10
    # ── HPO (optimización automática de hiperparámetros, Fase 4) ──────────────
    hpo:        bool = False
    hpo_trials: int  = 10
    hpo_effort: str  = "balanced"   # fast | balanced | thorough (fidelidad del proxy)

    @staticmethod
    def from_dict(data: dict) -> "PipelineJob":
        def _opt_int(value):
            return int(value) if value not in (None, "") else None

        def _flag(value) -> bool:
            return str(value).lower() in ("true", "1", "yes")

        def _aug_config(value) -> dict:
            """Acepta el catálogo como dict ya parseado o como JSON-string."""
            if isinstance(value, dict):
                return value
            if isinstance(value, str) and value.strip():
                try:
                    parsed = json.loads(value)
                    return parsed if isinstance(parsed, dict) else {}
                except (ValueError, TypeError):
                    return {}
            return {}

        return PipelineJob(
            execution_id=data["executionId"],
            pipeline_id =data.get("pipelineId",  "unknown"),
            workspace_id=data["workspaceId"],
            dataset_path=data["datasetPath"],
            framework   =data.get("framework",    "tensorflow"),
            architecture=data.get("architecture", "cnn"),
            epochs      =int(data.get("epochs",       5)),
            batch_size  =int(data.get("batchSize",    32)),
            learning_rate=float(data.get("learningRate", 0.001)),
            num_classes =int(data.get("numClasses",   10)),
            model_name  =data.get("modelName",    "synapseops_model"),
            preprocessing_strategy=data.get(
                "preprocessingStrategy", "normalization"),
            image_size  =_opt_int(data.get("imageSize")),
            train_ratio =_opt_int(data.get("trainRatio")),
            normalization=(data.get("normalization") or "minmax").lower(),
            data_augmentation=_flag(data.get("dataAugmentation")),
            augmentation_config=_aug_config(data.get("augmentationConfig")),
            class_balancing=(data.get("classBalancing") or "off").lower(),
            balance_threshold=int(data.get("balanceThreshold", 40) or 40),
            dropout     =float(data.get("dropout", 0.4) or 0.4),
            l2          =float(data.get("l2", 0.0) or 0.0),
            feature_extraction_epochs=int(data.get("featureExtractionEpochs", 5) or 5),
            feature_extraction_lr=float(data.get("featureExtractionLr", 0.001) or 0.001),
            finetuning_epochs=int(data.get("finetuningEpochs", 10) or 10),
            finetuning_lr=float(data.get("finetuningLr", 0.00001) or 0.00001),
            unfreeze_layers=int(data.get("unfreezeLayers", 10) or 10),
            optimizer   =(data.get("optimizer") or "adam").lower(),
            batch_norm  =_flag(data.get("batchNorm")),
            early_stopping=_flag(data.get("earlyStopping")),
            es_patience =int(data.get("esPatience", 3) or 3),
            es_monitor  =data.get("esMonitor", "val_loss") or "val_loss",
            hpo         =_flag(data.get("hpo")),
            hpo_trials  =int(data.get("hpoTrials", 10) or 10),
            hpo_effort  =(data.get("hpoEffort") or "balanced").lower(),
        )


class PipelineExecutor:
    """
    Template Method
    Orquesta: load → train → register.
    No implementa ningún paso — delega en ingestion y strategies.
    """

    SUPPORTED_ARCHS = ("cnn", "efficientnet", "mobilenet", "resnet")
    # Rango de resolución para backbones preentrenados (aceptan tamaño variable):
    # piso donde aún extraen features útiles y techo = resolución de los pesos ImageNet.
    MIN_PRETRAINED_SIZE = 96
    MAX_PRETRAINED_SIZE = 224
    # HPO (Fase 4): presupuesto por trial (proxy barato); el reentreno final usa el dataset
    # completo. El "esfuerzo" controla la fidelidad del proxy (epochs, nº imágenes): más
    # esfuerzo = selección de hiperparámetros más fiable, pero más tiempo. Con pruning los
    # trials malos se cortan antes, así que se puede permitir más epochs sin disparar el coste.
    HPO_EFFORT = {
        "fast":     (3, 3000),
        "balanced": (5, 6000),
        "thorough": (8, 10000),
    }
    HPO_MAX_TRIALS = 40

    def __init__(self) -> None:
        self._mlflow = MLflowFacade()
        self._logs = LogProducer()

    def _emit(self, execution_id: str, message: str, level: str = "INFO") -> None:
        self._logs.log(execution_id, message, level)

    def execute(self, job: PipelineJob) -> dict:
        log.info("Pipeline iniciado — execution=%s framework=%s dataset=%s",
                 job.execution_id, job.framework, job.dataset_path)
        try:
            return self._run(job)
        except Exception as e:
            log.exception("Error en pipeline execution=%s", job.execution_id)
            # Mensaje accionable si el fallo es por memoria EN PROCESO (VRAM de GPU o RAM):
            # TF ResourceExhausted, CUDA OOM de torch, bad_alloc o MemoryError. (Un OOM-kill
            # del cgroup mata el proceso y no llega aquí → eso lo cubre el reinicio + telemetría.)
            low = str(e).lower()
            if isinstance(e, MemoryError) or any(
                k in low for k in ("out of memory", "resourceexhausted", "oom when",
                                   "bad_alloc", "cuda error", "cublas", "cudnn")):
                self._emit(job.execution_id,
                           "Fallo por memoria (GPU/RAM): reduce el batch size, el tamaño de "
                           "imagen o el dataset. En backbones pesados (p. ej. ResNet) prueba "
                           "una arquitectura más ligera (MobileNet) o menor resolución.", "ERROR")
            try:
                self._mlflow.end_run("FAILED")
            except Exception:
                pass
            return {
                "execution_id": job.execution_id,
                "status":       "FAILED",
                "error":        str(e),
            }
        finally:
            # Limpieza de disco transitorio incluso si el run FALLÓ (un OOM en ingesta
            # dejaba extracted/ sin borrar → se acumulaba en la siguiente corrida).
            try:
                self._cleanup_ingestion_artifacts(job)
            except Exception:  # noqa: BLE001
                pass
            # El ml-engine es un proceso persistente que procesa jobs en SERIE. Sin
            # liberar el grafo de TF/torch y los arrays del run, la memoria se acumula
            # entre ejecuciones y satura la RAM (segundo run se apila sobre el primero).
            self._free_memory()

    def _safe_max_images(self, job: PipelineJob, current: "int | None") -> "int | None":
        """Tope de imágenes según la memoria DISPONIBLE y el tamaño de imagen, para que
        el dataset materializado quepa en RAM (presupuesto ~40% de lo disponible; deja
        margen para el pico de carga, el modelo y el framework). Devuelve el mínimo entre
        este tope y `current`. Si no se puede leer la memoria, deja `current`."""
        status = self._memory_status()
        if not status:
            return current
        used, limit = status
        avail = max(0.5, limit - used)              # GB disponibles
        size = job.image_size or 64
        # El dataset se materializa en uint8 (1 byte/canal, Min-Max) y se castea a float por
        # lote. (zscore/rescale retirados → ya no existe la variante float32 ×4.)
        per_img_gb = (size * size * 3) / 1e9
        if per_img_gb <= 0:
            return current
        # Reserva los costes FIJOS (framework + libs CUDA host ≈ _FRAMEWORK_RESERVE_GB y el
        # buffer de shuffle ≈ 0.5 GB) y deja el resto para el dataset, con 85% de margen sobre
        # lo restante. Antes era un 40% plano que dejaba poco aire → runs al borde del límite.
        budget = max(0.5, avail - self._FRAMEWORK_RESERVE_GB - 0.5)
        safe = max(200, int(budget * 0.85 / per_img_gb))
        capped = safe if current is None else min(safe, current)
        # Informa solo cuando la memoria es el límite efectivo (cap realmente bajo).
        if capped < 20_000:
            self._emit(job.execution_id,
                       f"Memoria disponible ~{avail:.1f} GB: si el dataset supera ~{capped} "
                       f"imágenes a {size}px, se submuestrea para evitar fallos por memoria.")
        return capped

    # Reserva fija estimada (GB): framework (import TF/torch) + librerías CUDA del lado host +
    # grafo + transitorios de métricas. ~3 GB observado empíricamente (medición Fase 1).
    _FRAMEWORK_RESERVE_GB = 3.0

    def _emit_training_plan(self, job: PipelineJob, n_train: int, n_val: int,
                            n_test: int, size: int, pretrained: bool) -> None:
        """Antes de entrenar: informa la huella de memoria esperada y ADVIERTE (sin bloquear)
        si la configuración es pesada (riesgo de OOM) o larga (tardará mucho, sobre todo en
        CPU). Complementa el cap funcional de ingesta (_safe_max_images) y los avisos en vivo
        (_warn_memory). Objetivo: que el usuario ajuste antes de un fallo, no después."""
        total = n_train + n_val + n_test
        # Dataset en uint8 (Min-Max; 1 byte/canal). El cast a float es por lote.
        per_img_gb = (size * size * 3) / 1e9
        dataset_gb = total * per_img_gb
        self._emit(job.execution_id,
                   f"Plan: {total} imágenes a {size}px ≈ {dataset_gb:.1f} GB en memoria (uint8) · "
                   f"{job.framework} · {job.architecture}.")

        status = self._memory_status()
        if status:
            _used, limit = status
            # Pico ≈ dataset + buffer de shuffle (~10k imgs uint8) + reserva del framework.
            # Tras la de-duplicación (Fase 1) ya NO se mantienen copias float de val/test.
            shuffle_gb = min(n_train, 10_000) * (size * size * 3) / 1e9
            peak = dataset_gb + shuffle_gb + self._FRAMEWORK_RESERVE_GB
            if peak >= limit * 0.85:
                self._emit(job.execution_id,
                           f"⚠ Configuración PESADA: pico de memoria estimado ≈ {peak:.1f} GB de "
                           f"{limit:.1f} GB → ALTO riesgo de fallo (OOM). Reduce el tamaño de "
                           f"imagen, el dataset o el batch size para asegurar que termine.", "WARN")
            elif peak >= limit * 0.70:
                self._emit(job.execution_id,
                           f"Aviso: pico de memoria estimado ≈ {peak:.1f} GB de {limit:.1f} GB; "
                           f"debería caber, pero con margen ajustado.", "WARN")

        # Advertencia de DURACIÓN para configs largas (backbones, imágenes grandes, datasets
        # grandes). En CPU pueden tardar mucho; con GPU es mucho más rápido.
        epochs = (job.feature_extraction_epochs + job.finetuning_epochs) if pretrained else job.epochs
        steps = max(1, (n_train + job.batch_size - 1) // job.batch_size) * max(1, epochs)
        heavy = pretrained or size >= 160 or n_train >= 15_000
        if heavy and steps >= 8_000:
            self._emit(job.execution_id,
                       f"Aviso: entrenamiento largo (~{steps} pasos · {epochs} epochs). En CPU "
                       f"puede tardar bastante; con GPU es mucho más rápido. Para solo validar el "
                       f"flujo, baja epochs o el tamaño del dataset.")

    def _emit_device(self, job: PipelineJob) -> None:
        """Informa al usuario si el entrenamiento usará GPU o CPU (visibilidad del acelerador)."""
        try:
            if job.framework == "pytorch":
                import torch
                dev = "GPU NVIDIA (CUDA)" if torch.cuda.is_available() else "CPU"
            else:
                import tensorflow as tf
                dev = "GPU NVIDIA" if tf.config.list_physical_devices("GPU") else "CPU"
            self._emit(job.execution_id, f"Acelerador: {dev}.")
        except Exception as e:  # noqa: BLE001
            log.debug("No se pudo detectar el acelerador: %s", e)

    def _memory_status(self) -> "tuple | None":
        """(usado_gb, limite_gb) del contenedor o, si no hay límite de cgroup, de la VM
        (/proc/meminfo). Devuelve el más restrictivo. None si no se puede leer (no-Linux)."""
        sys_used = sys_limit = None
        try:
            info = {}
            with open("/proc/meminfo", encoding="utf-8") as f:
                for line in f:
                    key, _, val = line.partition(":")
                    info[key.strip()] = val.strip()
            total = int(info["MemTotal"].split()[0]) * 1024
            avail = int(info["MemAvailable"].split()[0]) * 1024
            sys_used, sys_limit = total - avail, total
        except Exception:  # noqa: BLE001 — no-Linux o formato inesperado
            pass
        cg = None
        try:
            with open("/sys/fs/cgroup/memory.max", encoding="utf-8") as f:
                raw = f.read().strip()
            if raw != "max":
                limit = int(raw)
                with open("/sys/fs/cgroup/memory.current", encoding="utf-8") as f:
                    cg = (int(f.read()), limit)
        except Exception:  # noqa: BLE001 — cgroup v1 o sin límite
            pass
        if cg and (sys_limit is None or cg[1] <= sys_limit):
            return cg[0] / 1e9, cg[1] / 1e9
        if sys_limit:
            return sys_used / 1e9, sys_limit / 1e9
        return None

    def _warn_memory(self, job: PipelineJob, stage: str) -> None:
        """Emite un aviso si la memoria usada supera los umbrales (75% / 90%). No bloquea."""
        status = self._memory_status()
        if not status:
            return
        used, limit = status
        pct = used / limit * 100 if limit else 0
        if pct >= 90:
            self._emit(job.execution_id,
                       f"⚠ Memoria al {pct:.0f}% ({used:.1f}/{limit:.1f} GB) en «{stage}». "
                       f"Riesgo ALTO de fallo por memoria (OOM). Reduce el batch size, el "
                       f"tamaño de imagen o el dataset, o cierra otras apps.", "WARN")
        elif pct >= 75:
            self._emit(job.execution_id,
                       f"Aviso: memoria al {pct:.0f}% ({used:.1f}/{limit:.1f} GB) en «{stage}». "
                       f"Si sigue subiendo puede haber lentitud o fallos; considera reducir "
                       f"el batch o el tamaño de imagen.", "WARN")

    def _free_memory(self) -> None:
        """Libera la memoria del run anterior (grafo TF, caché torch, arrays) para que
        no se acumule entre ejecuciones serializadas. Best-effort; no importa frameworks
        que no estén ya cargados.

        Nota sobre VRAM: TensorFlow NO devuelve al driver la VRAM ya reservada por su
        allocator (BFC) hasta que el proceso termina — clear_session() libera el grafo pero
        el pool queda reservado y se REUTILIZA en el siguiente run (no es fuga ni crece sin
        límite). Para que TF sí devuelva VRAM al driver tras liberar, se usa el allocator
        asíncrono de CUDA vía env TF_GPU_ALLOCATOR=cuda_malloc_async (docker-compose.gpu.yml).
        torch sí devuelve su caché con empty_cache()+ipc_collect()."""
        try:
            tf = sys.modules.get("tensorflow")
            if tf is not None:
                tf.keras.backend.clear_session()
        except Exception:  # noqa: BLE001
            pass
        try:
            torch = sys.modules.get("torch")
            if torch is not None and torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
        except Exception:  # noqa: BLE001
            pass
        gc.collect()

    def _run_hpo(self, job: PipelineJob, bundle, aug_cfg: dict) -> None:
        """Fase 4 · Ejecuta Optuna para elegir hiperparámetros y los aplica al `job` (el
        entrenamiento final, más abajo, los usa sobre el dataset COMPLETO). Best-effort: ante
        cualquier fallo deja los hiperparámetros indicados por el usuario."""
        from app.pipeline.training import hpo
        n_trials = max(2, min(int(job.hpo_trials or 10), self.HPO_MAX_TRIALS))
        trial_epochs, trial_max = self.HPO_EFFORT.get(
            (job.hpo_effort or "balanced").lower(), self.HPO_EFFORT["balanced"])
        arch = (job.architecture or "cnn").lower()
        strategy = self._select_strategy(job.framework)
        self._emit(job.execution_id,
                   f"HPO: optimización automática de hiperparámetros — {n_trials} trials "
                   f"(esfuerzo «{job.hpo_effort}»: {trial_epochs} epochs sobre ≤{trial_max} "
                   f"imágenes; los trials malos se cortan antes). El entreno final usa el dataset completo.")

        def build_hp(params: dict, epochs: int) -> HyperParams:
            return HyperParams(
                epochs=epochs, batch_size=job.batch_size, architecture=job.architecture,
                learning_rate=params["learning_rate"], num_classes=bundle.num_classes,
                input_shape=bundle.input_shape, optimizer=params["optimizer"],
                batch_norm=job.batch_norm, early_stopping=False,
                data_augmentation=job.data_augmentation, augmentation_config=aug_cfg,
                dropout=params["dropout"], l2=params["l2"],
                feature_extraction_epochs=epochs,
                feature_extraction_lr=params.get("feature_extraction_lr", job.feature_extraction_lr),
                finetuning_epochs=max(1, epochs // 2),
                finetuning_lr=params.get("finetuning_lr", job.finetuning_lr),
                unfreeze_layers=params.get("unfreeze_layers", job.unfreeze_layers),
            )

        try:
            best = hpo.run_study(
                job, bundle, strategy, build_hp, n_trials,
                trial_epochs, trial_max,
                lambda m: self._emit(job.execution_id, m), cleanup=self._free_memory)
        except Exception as e:  # noqa: BLE001 — HPO complementario, no debe tumbar el run
            self._emit(job.execution_id,
                       f"HPO: no se pudo completar ({e}); se usan los hiperparámetros indicados.",
                       "WARN")
            log.warning("HPO falló: %s", e)
            return

        job.learning_rate = float(best.get("learning_rate", job.learning_rate))
        job.dropout = float(best.get("dropout", job.dropout))
        job.optimizer = str(best.get("optimizer", job.optimizer))
        job.l2 = float(best.get("l2", job.l2))
        if arch != "cnn":
            job.feature_extraction_lr = float(best.get("feature_extraction_lr", job.feature_extraction_lr))
            job.finetuning_lr = float(best.get("finetuning_lr", job.finetuning_lr))
            job.unfreeze_layers = int(best.get("unfreeze_layers", job.unfreeze_layers))
        self._emit(job.execution_id,
                   "HPO: aplicando los mejores hiperparámetros al entrenamiento final…")

    def _run(self, job: PipelineJob) -> dict:
        # ── Paso 0: Validar arquitectura ──────────────────────────────────────
        arch = (job.architecture or "cnn").lower()
        if arch not in self.SUPPORTED_ARCHS:
            raise ValueError(
                f"Arquitectura '{job.architecture}' no soportada. "
                f"Disponibles: {', '.join(self.SUPPORTED_ARCHS)}.")
        pretrained = arch != "cnn"

        # Transfer Learning: los backbones (conv + GlobalAveragePooling) aceptan resolución
        # VARIABLE con los pesos ImageNet. Se permite un rango [96, 224] como "punto
        # equilibrado" de memoria/calidad: 224 = máxima calidad (default si no se elige);
        # 160 ≈ mitad de memoria con buena calidad; 96 = piso (debajo el mapa de features
        # colapsa). NO se reduce batch ni dataset (equipos ≥16 GB); se ADVIERTE si es pesado.
        max_images = None
        if pretrained:
            requested = job.image_size or self.MAX_PRETRAINED_SIZE
            if requested < self.MIN_PRETRAINED_SIZE:
                # Tamaño muy bajo para un backbone (p. ej. el default 64 del nodo, pensado para
                # CNN) → máxima calidad (224). Solo [96,224] se trata como elección deliberada.
                size = self.MAX_PRETRAINED_SIZE
                self._emit(job.execution_id,
                           f"Preprocesamiento: {requested}px es muy bajo para un backbone → se usa "
                           f"{size}×{size}px (máxima calidad). Para ahorrar memoria elige entre "
                           f"{self.MIN_PRETRAINED_SIZE} y {self.MAX_PRETRAINED_SIZE}px en el nodo "
                           f"de Preprocesamiento (p. ej. 160px ≈ mitad de memoria).")
            elif requested > self.MAX_PRETRAINED_SIZE:
                size = self.MAX_PRETRAINED_SIZE
                self._emit(job.execution_id,
                           f"Preprocesamiento: {requested}px ajustado a {size}px "
                           f"(resolución de los pesos ImageNet).")
            else:
                size = requested
                self._emit(job.execution_id,
                           f"Preprocesamiento: backbone a {size}×{size}px.")
            job.image_size = size
            if job.batch_size > 64:
                self._emit(job.execution_id,
                           f"Aviso: batch grande ({job.batch_size}) a {size}px consume bastante "
                           f"memoria; si el entrenamiento falla por memoria (OOM) o va lento, "
                           f"reduce el batch size.", "WARN")

        if not pretrained and (job.image_size or 64) > 256:
            # CNN: la resolución la fija el usuario (16–512). La memoria y el tiempo crecen
            # con el cuadrado del tamaño → aviso si es alta.
            self._emit(job.execution_id,
                       f"Aviso: {job.image_size}px en CNN consume bastante memoria y tiempo "
                       f"(crece con el cuadrado del tamaño). Si falla por memoria o va lento, "
                       f"baja el tamaño en el nodo de Preprocesamiento.", "WARN")

        # Pre-limpieza: borra disco transitorio (extracted/, downloads/) que un crash
        # duro anterior pudo dejar sin limpiar, antes de extraer este dataset.
        self._cleanup_ingestion_artifacts(job)
        # Cap por memoria DISPONIBLE: nunca materializar más imágenes de las que caben en
        # RAM (evita el OOM en ingesta, sobre todo a 224px). Más restrictivo que MAX_IMAGES.
        max_images = self._safe_max_images(job, max_images)

        # ── Nodo Ingesta: cargar dataset (delegado a ingestion) ───────────────
        # TEL-01 · t_inicio_ingesta: marca de tiempo del inicio del ciclo (Process Tracker).
        t_inicio_ingesta = datetime.now().isoformat(timespec="milliseconds")
        self._emit(job.execution_id, "Ingesta: cargando dataset…")
        bundle = load_dataset(
            job.dataset_path, job.workspace_id, job.execution_id,
            image_size=job.image_size, train_ratio=job.train_ratio,
            normalization=job.normalization, max_images=max_images)
        X_train, y_train = bundle.X_train, bundle.y_train
        X_val,   y_val   = bundle.X_val,   bundle.y_val
        input_shape, num_classes = bundle.input_shape, bundle.num_classes

        # Los datos ya están materializados en memoria → se libera el disco transitorio
        # de la ingesta (extracted/{execId} y descargas). Evita que cada ejecución deje
        # una copia extraída del dataset y desborde la cuota del workspace.
        self._cleanup_ingestion_artifacts(job)

        # Actualizar num_classes con el valor real del dataset (autodetección)
        job.num_classes = num_classes
        log.info("Dataset listo: shape=%s classes=%d test=%s",
                 input_shape, num_classes, bundle.X_test is not None)
        self._emit(job.execution_id,
                   f"Ingesta: dataset listo — {num_classes} clases · shape {input_shape}")

        # ── Nodo Preprocesamiento: normalización + augmentation + balanceo ────
        # Catálogo de augmentation ya saneado (compartido por balanceo y estrategias).
        aug_cfg = augmentation.normalize_config(job.augmentation_config, job.data_augmentation)
        aug = f"augmentation [{augmentation.summarize(aug_cfg)}]" if aug_cfg else "sin augmentation"
        self._emit(job.execution_id,
                   f"Preprocesamiento: normalización={job.normalization} · {aug} · "
                   f"entrada {input_shape[0]}x{input_shape[1]}")

        # Balanceo de clases: opera SOLO sobre el train (copias locales). El bundle
        # original queda intacto para el cálculo de drift y la referencia del proyecto.
        balance_report = None
        if job.class_balancing != "off":
            # El oversampling genera imágenes sintéticas → puede CRECER el train. Se acota
            # al MISMO cap de memoria que la ingesta (no a MAX_IMAGES) para no desbordar la
            # RAM tras balancear. `max_images` puede ser None (sin lectura de memoria) → cap por defecto.
            X_train, y_train, balance_report = balancing.balance_dataset(
                X_train, y_train, job.class_balancing, job.balance_threshold,
                bundle.class_names, augmentation_cfg=aug_cfg,
                max_images=max_images or MAX_IMAGES)
            self._emit_balancing(job, balance_report)

        # ── Nodo Split: train / validación / test ─────────────────────────────
        test_n = 0 if bundle.X_test is None else len(bundle.X_test)
        self._emit(job.execution_id,
                   f"Split: train={len(X_train)} · validación={len(X_val)} · test={test_n}")

        # Estimación de huella + advertencias ANTES de entrenar (config pesada/larga).
        self._emit_training_plan(job, len(X_train), len(X_val), test_n,
                                 input_shape[0], pretrained)
        # Umbral de memoria real del contenedor/VM tras materializar el dataset (el punto
        # de mayor consumo antes de entrenar). No restringe; avisa con thresholds claros.
        self._warn_memory(job, "carga del dataset")

        # ── HPO opcional (Fase 4): elige los mejores hiperparámetros ANTES del entreno
        # final. Aplica los resultados sobre `job`, de modo que el resto del flujo (build de
        # HyperParams + log de params + entrenamiento) usa ya los valores óptimos.
        if job.hpo:
            self._run_hpo(job, bundle, aug_cfg)

        # ── Paso 2: Iniciar MLflow run ────────────────────────────────────────
        experiment_id = self._mlflow.get_or_create_experiment(
            f"pipeline_{job.pipeline_id}")
        run_id = self._mlflow.start_run(
            experiment_id=experiment_id,
            run_name=f"exec_{job.execution_id}",
        )
        arch_label = "cnn_adaptive" if arch == "cnn" else arch
        self._mlflow.log_params({
            "framework":     job.framework,
            "architecture":  arch_label,
            "epochs":        job.epochs,
            "batch_size":    job.batch_size,
            "learning_rate": job.learning_rate,
            "num_classes":   num_classes,
            "input_shape":   str(input_shape),
            "dataset":       job.dataset_path,
            "normalization": job.normalization,
            "data_augmentation": job.data_augmentation,
            "augmentation":  augmentation.summarize(aug_cfg),
            "class_balancing": job.class_balancing,
            "balance_threshold": job.balance_threshold if job.class_balancing != "off" else "—",
            "dropout":       job.dropout,
            "l2":            job.l2,
            "optimizer":     job.optimizer,
            "batch_norm":    job.batch_norm,
            "early_stopping": job.early_stopping,
            "es_monitor":    job.es_monitor if job.early_stopping else "—",
            "train_ratio":   job.train_ratio if job.train_ratio is not None else "auto(80)",
        })
        if job.hpo:
            # Los mejores hiperparámetros ya están en job.* (los loguea el bloque de arriba);
            # aquí solo se deja constancia de que la búsqueda HPO se ejecutó.
            self._mlflow.log_params({
                "hpo": True,
                "hpo_trials": max(2, min(int(job.hpo_trials or 10), self.HPO_MAX_TRIALS)),
                "hpo_effort": job.hpo_effort,
            })
        if pretrained:
            self._mlflow.log_params({
                "pretrained_backbone":       arch,
                "feature_extraction_epochs": job.feature_extraction_epochs,
                "feature_extraction_lr":     job.feature_extraction_lr,
                "finetuning_epochs":         job.finetuning_epochs,
                "finetuning_lr":             job.finetuning_lr,
                "unfreeze_layers":           job.unfreeze_layers,
            })

        # ── Paso 3: Entrenar (delegado a Strategy) ────────────────────────────
        hp = HyperParams(
            epochs=job.epochs,
            batch_size=job.batch_size,
            architecture=job.architecture,
            learning_rate=job.learning_rate,
            num_classes=num_classes,
            input_shape=input_shape,
            optimizer=job.optimizer,
            batch_norm=job.batch_norm,
            early_stopping=job.early_stopping,
            es_patience=job.es_patience,
            es_monitor=job.es_monitor,
            data_augmentation=job.data_augmentation,
            augmentation_config=aug_cfg,
            dropout=job.dropout,
            l2=job.l2,
            feature_extraction_epochs=job.feature_extraction_epochs,
            feature_extraction_lr=job.feature_extraction_lr,
            finetuning_epochs=job.finetuning_epochs,
            finetuning_lr=job.finetuning_lr,
            unfreeze_layers=job.unfreeze_layers,
        )
        output_dir = self._prepare_output_dir(job)
        strategy   = self._select_strategy(job.framework)
        self._emit_device(job)
        if pretrained:
            self._emit(job.execution_id,
                       f"Entrenamiento ({arch}, 2 fases): Feature Extraction "
                       f"{job.feature_extraction_epochs} ep · LR={job.feature_extraction_lr:g} → "
                       f"Fine-Tuning {job.finetuning_epochs} ep · LR={job.finetuning_lr:g} "
                       f"(descongela {job.unfreeze_layers} capas) · batch {job.batch_size}…")
        else:
            self._emit(job.execution_id,
                       f"Entrenamiento: {job.framework} · {job.epochs} epochs (batch {job.batch_size})…")

        def on_epoch(epoch: int, total: int, metrics: dict) -> None:
            phase = metrics.get("phase")
            parts = [f"Epoch {epoch}/{total}" + (f" [{phase}]" if phase else "")]
            if "loss" in metrics:
                parts.append(f"loss={metrics['loss']:.4f}")
            if "accuracy" in metrics:
                parts.append(f"acc={metrics['accuracy']:.4f}")
            if "val_loss" in metrics:
                parts.append(f"val_loss={metrics['val_loss']:.4f}")
            if "val_accuracy" in metrics:
                parts.append(f"val_acc={metrics['val_accuracy']:.4f}")
            self._emit(job.execution_id, " — ".join(parts))

        # Encabezado descriptivo al INICIO REAL de cada fase de Transfer Learning, para
        # que el usuario entienda el salto de numeración de épocas (FE→FT) y qué ocurre.
        def on_phase(info: dict) -> None:
            if info.get("phase") == "FE":
                self._emit(job.execution_id,
                           f"Fase 1/2 · Feature Extraction — backbone congelado (solo se "
                           f"entrena la cabeza de clasificación): {info['epochs']} epochs · "
                           f"LR={info['lr']:g}.")
            elif info.get("phase") == "FT":
                self._emit(job.execution_id,
                           f"Fase 2/2 · Fine-Tuning — descongeladas las últimas "
                           f"{info['unfreeze']} capas del backbone: {info['epochs']} epochs · "
                           f"LR={info['lr']:g} (más bajo para no destruir lo aprendido).")

        result: TrainingResult = strategy.train(
            X_train, y_train, X_val, y_val, hp, output_dir,
            X_test=bundle.X_test, y_test=bundle.y_test, on_epoch=on_epoch,
            class_names=bundle.class_names, on_phase=on_phase)
        # TEL-01 · t_fin_entrenamiento: fin del entrenamiento (antes del registro en MLflow).
        t_fin_entrenamiento = datetime.now().isoformat(timespec="milliseconds")
        self._warn_memory(job, "fin del entrenamiento")

        # ── Paso 4: Loguear métricas en MLflow ────────────────────────────────
        for step, (acc, loss) in enumerate(
            zip(result.history["accuracy"], result.history["loss"])
        ):
            self._mlflow.log_metric("accuracy", float(acc), step=step)
            self._mlflow.log_metric("loss",     float(loss), step=step)
        for step, (acc, loss) in enumerate(
            zip(result.history.get("val_accuracy", []),
                result.history.get("val_loss",     []))
        ):
            self._mlflow.log_metric("val_accuracy", float(acc), step=step)
            self._mlflow.log_metric("val_loss",     float(loss), step=step)

        # Métricas del split de test (evaluación final, si el dataset lo incluye).
        if result.test_accuracy is not None:
            self._mlflow.log_metric("test_accuracy", float(result.test_accuracy))
            self._mlflow.log_metric("test_loss",     float(result.test_loss))

        # ── Métricas avanzadas + matriz de confusión (item 7) ─────────────────
        advanced: dict = {}
        confusion = None
        # Train: mismas métricas que val/test para comparar simétricamente los splits.
        if result.train_pred is not None and result.train_true is not None:
            advanced.update(compute_classification_metrics(
                result.train_true, result.train_pred, result.train_proba, num_classes, "train"))
        if result.val_pred is not None and result.val_true is not None:
            advanced.update(compute_classification_metrics(
                result.val_true, result.val_pred, result.val_proba, num_classes, "val"))
            confusion = confusion_matrix_payload(
                result.val_true, result.val_pred, bundle.class_names, num_classes)
        if result.test_pred is not None and result.test_true is not None:
            advanced.update(compute_classification_metrics(
                result.test_true, result.test_pred, result.test_proba, num_classes, "test"))
        for key, value in advanced.items():
            self._mlflow.log_metric(key, float(value))
        if confusion is not None:
            try:
                # Matriz de confusión como tag JSON → render en el frontend (item 7).
                mlflow.set_tag("confusion_matrix", json.dumps(confusion))
            except Exception as e:  # noqa: BLE001
                log.debug("No se pudo registrar la matriz de confusión: %s", e)
        if advanced:
            self._emit(job.execution_id,
                       "Evaluación: " + " · ".join(f"{k}={v:.4f}" for k, v in advanced.items()))

        # Overfitting (gap train/val): se emite a la consola para que el SSE COINCIDA con
        # el panel del nodo y el detalle del modelo (antes solo se mostraba en el panel).
        overfit_warning = _compute_overfit_warning(result, bundle)
        if overfit_warning:
            level = "WARN" if overfit_warning["severity"] in ("high", "moderate") else "INFO"
            extra = ""
            if overfit_warning["severity"] in ("high", "moderate") and not aug_cfg:
                extra = (" Este entrenamiento NO usa data augmentation: activarlo (o subir "
                         "dropout/L2, o reducir epochs) suele reducir el overfitting.")
            self._emit(job.execution_id, "Calidad: " + overfit_warning["message"] + extra, level)

        # ── Data drift (calidad del split + re-entrenamiento) ─────────────────
        drift_summary = self._compute_drift(job, bundle, output_dir)

        # ── Interpretabilidad: galería Score-CAM como artefacto MLflow ────────
        if result.interpretability_path:
            try:
                mlflow.log_artifact(result.interpretability_path,
                                    artifact_path="interpretability")
                self._emit(job.execution_id,
                           "Interpretabilidad: galería Score-CAM generada (ver artefactos del run).")
            except Exception as e:  # noqa: BLE001
                log.debug("No se pudo registrar la galería Score-CAM: %s", e)

        # Metadatos del modelo (tamaño/canales/clases reales) junto al artefacto.
        # El model-service los lee con prioridad sobre las env vars del orquestador,
        # imprescindible cuando el tamaño se forzó internamente (p. ej. 224 en TL).
        self._write_model_meta(output_dir, input_shape, num_classes,
                               bundle.class_names, job.architecture)

        # ── Nodo Registro: registrar artefacto en MLflow ──────────────────────
        self._emit(job.execution_id, "Registro: registrando modelo en el Model Registry de MLflow…")
        mlflow.log_artifact(result.artifact_path, artifact_path="model")
        model_version = self._mlflow.register_model(
            run_id=run_id, model_name=job.model_name)

        self._mlflow.end_run("FINISHED")

        log.info("Pipeline COMPLETADO — run_id=%s version=%s acc=%.4f",
                 run_id, model_version, result.final_accuracy)

        return {
            "execution_id":  job.execution_id,
            "status":        "SUCCESS",
            "run_id":        run_id,
            "model_version": model_version,
            "artifact_path": result.artifact_path,
            # TEL-01 · timestamps del ciclo (ISO-8601 local) para el Process Tracker.
            "t_inicio_ingesta":    t_inicio_ingesta,
            "t_fin_entrenamiento": t_fin_entrenamiento,
            "hyperparameters": {
                "framework":     result.framework,
                "architecture":  arch_label,
                "epochs":        (job.feature_extraction_epochs + job.finetuning_epochs)
                                 if pretrained else job.epochs,
                "batch_size":    job.batch_size,
                "learning_rate": job.learning_rate,
                "num_classes":   num_classes,
                "input_shape":   str(input_shape),
                "preprocessing": job.preprocessing_strategy,
            },
            "metrics": {
                "final_accuracy": result.final_accuracy,
                "final_loss":     result.final_loss,
                "val_accuracy":   (result.history.get("val_accuracy") or [None])[-1],
                "val_loss":       (result.history.get("val_loss") or [None])[-1],
                "test_accuracy":  result.test_accuracy,
                "test_loss":      result.test_loss,
                # Métrica HONESTA principal: test ciego si existe; si no, validación.
                "primary_accuracy": result.test_accuracy
                    if result.test_accuracy is not None
                    else (result.history.get("val_accuracy") or [None])[-1],
                "primary_split": "test" if result.test_accuracy is not None else "val",
                **advanced,
            },
            # Detección de overfitting: gap > 15% entre train y validation accuracy
            "overfit_warning": overfit_warning,
            "confusion_matrix": confusion,
            # Data drift (calidad del split + cambio del dataset vs corrida anterior).
            "drift": drift_summary,
            # Balanceo de clases aplicado (distribución antes→después), si lo hubo.
            "balancing": balance_report,
        }

    def _select_strategy(self, framework: str) -> object:
        """Factory method — elige la Strategy según el framework."""
        if framework == "pytorch":
            return PyTorchStrategy()
        return TensorFlowStrategy()

    def _prepare_output_dir(self, job: PipelineJob) -> str:
        path = (Path(settings.storage_base_path) /
                job.workspace_id / "models" / job.execution_id)
        path.mkdir(parents=True, exist_ok=True)
        return str(path)

    def _write_model_meta(self, output_dir: str, input_shape, num_classes: int,
                          class_names: list, architecture: str) -> None:
        """Guarda model_meta.json junto al artefacto: tamaño/canales/clases reales con
        que se entrenó. El model-service lo prefiere sobre INPUT_SIZE/CHANNELS/CLASS_NAMES
        del orquestador (clave cuando el tamaño se fuerza internamente, p. ej. TL 224px)."""
        try:
            meta = {
                "input_size": int(input_shape[0]),
                "channels":   int(input_shape[2]) if len(input_shape) > 2 else 1,
                "num_classes": int(num_classes),
                "class_names": list(class_names),
                "architecture": architecture,
            }
            path = Path(output_dir) / "model_meta.json"
            path.write_text(json.dumps(meta), encoding="utf-8")
            try:
                mlflow.log_artifact(str(path), artifact_path="model")
            except Exception:  # noqa: BLE001
                pass
            log.info("model_meta.json escrito: %s", meta)
        except Exception as e:  # noqa: BLE001 — metadato no crítico
            log.warning("No se pudo escribir model_meta.json: %s", e)

    def _cleanup_ingestion_artifacts(self, job: PipelineJob) -> None:
        """Elimina el disco transitorio de la ingesta del workspace (extracted/ y
        downloads/). Tras load_dataset los datos viven en memoria, así que estas copias
        no se necesitan. El consumer procesa en serie, por lo que no hay otra ingesta en
        curso usando estas carpetas. Acota el uso de disco a dataset + modelos."""
        base = Path(settings.storage_base_path) / job.workspace_id
        for sub in ("extracted", "downloads"):
            d = base / sub
            if d.exists():
                try:
                    shutil.rmtree(d, ignore_errors=True)
                    log.info("Limpieza de ingesta: %s eliminado.", d)
                except Exception as e:  # noqa: BLE001 — limpieza no crítica
                    log.warning("No se pudo limpiar %s: %s", d, e)

    # ── Data drift ────────────────────────────────────────────────────────────
    def _compute_drift(self, job: PipelineJob, bundle, output_dir: str) -> "dict | None":
        """Drift de calidad del split (train vs val) y de re-entrenamiento (dataset
        actual vs anterior del mismo proyecto). Nunca interrumpe el entrenamiento."""
        try:
            train_feats = drift.extract_features(bundle.X_train)
            val_feats = drift.extract_features(bundle.X_val)
            summary: dict = {}

            # 1) Calidad del split: ¿la validación distribuye como el train?
            split = drift.compute_drift(train_feats, val_feats)
            if split is not None:
                summary["split"] = split
                self._log_drift_metrics("split", split)
                self._safe_log_artifact(
                    drift.evidently_report(train_feats, val_feats, output_dir, "split"))

            # 2) Re-entrenamiento: dataset de esta corrida vs el de la anterior.
            ref_path = str(Path(settings.storage_base_path) / job.workspace_id /
                           "drift" / f"pipeline_{job.pipeline_id}_reference.json")
            prev = drift.load_reference(ref_path)
            if prev is not None and prev.size:
                retrain = drift.compute_drift(prev, train_feats)
                if retrain is not None:
                    summary["retraining"] = retrain
                    self._log_drift_metrics("retrain", retrain)
                    self._safe_log_artifact(
                        drift.evidently_report(prev, train_feats, output_dir, "retraining"))

            # Actualiza la referencia del proyecto + guarda la huella del modelo
            # (para el drift de inferencia del model-service — fase posterior).
            drift.save_reference(bundle.X_train, ref_path)
            model_ref = str(Path(output_dir) / "train_reference.json")
            drift.save_reference(bundle.X_train, model_ref)
            self._safe_log_artifact(model_ref)

            self._emit_drift(job, summary)
            return summary or None
        except Exception as e:  # noqa: BLE001 — el drift es complementario
            log.warning("Drift: no se pudo calcular (%s)", e)
            return None

    def _log_drift_metrics(self, tag: str, summary: dict) -> None:
        try:
            self._mlflow.log_metric(f"drift_{tag}_max_psi", float(summary["max_psi"]))
            self._mlflow.log_metric(f"drift_{tag}_share", float(summary["share_drifted"]))
        except Exception:  # noqa: BLE001
            pass

    def _safe_log_artifact(self, path: "str | None") -> None:
        if not path:
            return
        try:
            mlflow.log_artifact(path, artifact_path="drift")
        except Exception as e:  # noqa: BLE001
            log.debug("No se pudo loguear el artefacto de drift: %s", e)

    def _emit_balancing(self, job: PipelineJob, report: "dict | None") -> None:
        if not report:
            return
        if report.get("skipped"):
            self._emit(job.execution_id,
                       f"Balanceo: omitido — {report.get('reason', 'dataset balanceado')}.")
            return
        before, after = report.get("before", {}), report.get("after", {})
        cambios = " · ".join(
            f"{c}: {before.get(c, 0)}→{after.get(c, 0)}" for c in after)
        cap = " (recortado al tope de memoria)" if report.get("capped") else ""
        self._emit(job.execution_id,
                   f"Balanceo ({report['strategy']}, umbral {report['threshold']}%): "
                   f"{cambios}{cap}.")

    def _emit_drift(self, job: PipelineJob, summary: dict) -> None:
        # Coherencia con el panel del nodo y el detalle del modelo: se reporta por
        # SEVERIDAD (none/moderate/significant), no solo el flag `drifted` (que es ≥0.25).
        # Así un PSI 0.10–0.25 NO se anuncia como "estable" en el SSE mientras el panel
        # lo marca "moderada".
        items = (
            ("split", "La validación difiere del entrenamiento", summary.get("split")),
            ("retrain", "Tu dataset cambió respecto a la corrida anterior", summary.get("retraining")),
        )
        any_present = False
        worst = "none"
        for _tag, msg, item in items:
            if not item:
                continue
            any_present = True
            sev = item.get("severity", "none")
            if sev == "significant":
                worst = "significant"
                self._emit(job.execution_id,
                           f"Drift ⚠ {msg}: deriva SIGNIFICATIVA (PSI máx {item['max_psi']}). "
                           f"Revisa el balance/calidad del dataset.", "WARN")
            elif sev == "moderate":
                if worst != "significant":
                    worst = "moderate"
                self._emit(job.execution_id,
                           f"Drift: {msg}: deriva moderada (PSI máx {item['max_psi']}). "
                           f"Conviene monitorearla.", "WARN")
        if any_present and worst == "none":
            self._emit(job.execution_id,
                       "Drift: sin deriva relevante en los datos (distribuciones estables).")