"""
Responsabilidad única: orquestar el pipeline MLOps.
Template Method — define los pasos fijos, delega en estrategias.
No conoce detalles de carga, preproceso ni frameworks.
"""
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import mlflow
import numpy as np

from app.config import settings
from app.infra.mlflow_client import MLflowFacade
from app.kafka.producer import LogProducer
from app.pipeline import drift
from app.pipeline.training.ingestion import load_dataset
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
    optimizer:         str  = "adam"      # adam | adamw | sgd | rmsprop
    batch_norm:        bool = False
    early_stopping:    bool = False
    es_patience:       int  = 3
    es_monitor:        str  = "val_loss"  # val_loss | val_accuracy

    @staticmethod
    def from_dict(data: dict) -> "PipelineJob":
        def _opt_int(value):
            return int(value) if value not in (None, "") else None

        def _flag(value) -> bool:
            return str(value).lower() in ("true", "1", "yes")

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
            optimizer   =(data.get("optimizer") or "adam").lower(),
            batch_norm  =_flag(data.get("batchNorm")),
            early_stopping=_flag(data.get("earlyStopping")),
            es_patience =int(data.get("esPatience", 3) or 3),
            es_monitor  =data.get("esMonitor", "val_loss") or "val_loss",
        )


class PipelineExecutor:
    """
    Template Method
    Orquesta: load → train → register.
    No implementa ningún paso — delega en ingestion y strategies.
    """

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
            try:
                self._mlflow.end_run("FAILED")
            except Exception:
                pass
            return {
                "execution_id": job.execution_id,
                "status":       "FAILED",
                "error":        str(e),
            }

    def _run(self, job: PipelineJob) -> dict:
        # ── Paso 0: Validar arquitectura (solo CNN soportada por ahora) ───────
        if job.architecture.lower() != "cnn":
            raise ValueError(
                f"Arquitectura '{job.architecture}' no soportada. "
                f"Actualmente solo está disponible 'cnn'.")

        # ── Nodo Ingesta: cargar dataset (delegado a ingestion) ───────────────
        # TEL-01 · t_inicio_ingesta: marca de tiempo del inicio del ciclo (Process Tracker).
        t_inicio_ingesta = datetime.now().isoformat(timespec="milliseconds")
        self._emit(job.execution_id, "Ingesta: cargando dataset…")
        bundle = load_dataset(
            job.dataset_path, job.workspace_id, job.execution_id,
            image_size=job.image_size, train_ratio=job.train_ratio,
            normalization=job.normalization)
        X_train, y_train = bundle.X_train, bundle.y_train
        X_val,   y_val   = bundle.X_val,   bundle.y_val
        input_shape, num_classes = bundle.input_shape, bundle.num_classes

        # Actualizar num_classes con el valor real del dataset (autodetección)
        job.num_classes = num_classes
        log.info("Dataset listo: shape=%s classes=%d test=%s",
                 input_shape, num_classes, bundle.X_test is not None)
        self._emit(job.execution_id,
                   f"Ingesta: dataset listo — {num_classes} clases · shape {input_shape}")

        # ── Nodo Preprocesamiento: normalización + augmentation ───────────────
        aug = "data augmentation ON" if job.data_augmentation else "sin augmentation"
        self._emit(job.execution_id,
                   f"Preprocesamiento: normalización={job.normalization} · {aug} · "
                   f"entrada {input_shape[0]}x{input_shape[1]}")

        # ── Nodo Split: train / validación / test ─────────────────────────────
        test_n = 0 if bundle.X_test is None else len(bundle.X_test)
        self._emit(job.execution_id,
                   f"Split: train={len(X_train)} · validación={len(X_val)} · test={test_n}")

        # ── Paso 2: Iniciar MLflow run ────────────────────────────────────────
        experiment_id = self._mlflow.get_or_create_experiment(
            f"pipeline_{job.pipeline_id}")
        run_id = self._mlflow.start_run(
            experiment_id=experiment_id,
            run_name=f"exec_{job.execution_id}",
        )
        self._mlflow.log_params({
            "framework":     job.framework,
            "architecture":  "cnn_adaptive",
            "epochs":        job.epochs,
            "batch_size":    job.batch_size,
            "learning_rate": job.learning_rate,
            "num_classes":   num_classes,
            "input_shape":   str(input_shape),
            "dataset":       job.dataset_path,
            "normalization": job.normalization,
            "data_augmentation": job.data_augmentation,
            "optimizer":     job.optimizer,
            "batch_norm":    job.batch_norm,
            "early_stopping": job.early_stopping,
            "es_monitor":    job.es_monitor if job.early_stopping else "—",
            "train_ratio":   job.train_ratio if job.train_ratio is not None else "auto(80)",
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
        )
        output_dir = self._prepare_output_dir(job)
        strategy   = self._select_strategy(job.framework)
        self._emit(job.execution_id,
                   f"Entrenamiento: entrenando con {job.framework} · {job.epochs} epochs (batch {job.batch_size})…")

        def on_epoch(epoch: int, total: int, metrics: dict) -> None:
            parts = [f"Epoch {epoch}/{total}"]
            if "loss" in metrics:
                parts.append(f"loss={metrics['loss']:.4f}")
            if "accuracy" in metrics:
                parts.append(f"acc={metrics['accuracy']:.4f}")
            if "val_loss" in metrics:
                parts.append(f"val_loss={metrics['val_loss']:.4f}")
            if "val_accuracy" in metrics:
                parts.append(f"val_acc={metrics['val_accuracy']:.4f}")
            self._emit(job.execution_id, " — ".join(parts))

        result: TrainingResult = strategy.train(
            X_train, y_train, X_val, y_val, hp, output_dir,
            X_test=bundle.X_test, y_test=bundle.y_test, on_epoch=on_epoch)
        # TEL-01 · t_fin_entrenamiento: fin del entrenamiento (antes del registro en MLflow).
        t_fin_entrenamiento = datetime.now().isoformat(timespec="milliseconds")

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

        # ── Data drift (calidad del split + re-entrenamiento) ─────────────────
        drift_summary = self._compute_drift(job, bundle, output_dir)

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
                "architecture":  "cnn_adaptive",
                "epochs":        job.epochs,
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
            "overfit_warning": _compute_overfit_warning(result, bundle),
            "confusion_matrix": confusion,
            # Data drift (calidad del split + cambio del dataset vs corrida anterior).
            "drift": drift_summary,
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

    def _emit_drift(self, job: PipelineJob, summary: dict) -> None:
        s, r = summary.get("split"), summary.get("retraining")
        if s and s["drifted"]:
            self._emit(job.execution_id,
                       f"Drift ⚠ La validación difiere del train (severidad {s['severity']}, "
                       f"PSI máx {s['max_psi']}). Revisa el balance/calidad del dataset.", "WARN")
        if r and r["drifted"]:
            self._emit(job.execution_id,
                       f"Drift ⚠ Tu dataset cambió respecto al último entrenamiento "
                       f"(severidad {r['severity']}, PSI máx {r['max_psi']}).", "WARN")
        if (s or r) and not (s and s["drifted"]) and not (r and r["drifted"]):
            self._emit(job.execution_id,
                       "Drift: sin deriva relevante en los datos (distribuciones estables).")