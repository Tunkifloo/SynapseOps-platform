"""
Responsabilidad única: orquestar el pipeline MLOps.
Template Method — define los pasos fijos, delega en estrategias.
No conoce detalles de carga, preproceso ni frameworks.
"""
import logging
from dataclasses import dataclass
from pathlib import Path

import mlflow
import numpy as np

from app.config import settings
from app.infra.mlflow_client import MLflowFacade
from app.kafka.producer import LogProducer
from app.pipeline.training.ingestion import load_dataset
from app.pipeline.training.base import HyperParams, TrainingResult
from app.pipeline.training.tensorflow_strategy import TensorFlowStrategy
from app.pipeline.training.pytorch_strategy import PyTorchStrategy

log = logging.getLogger(__name__)


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

    @staticmethod
    def from_dict(data: dict) -> "PipelineJob":
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

        # ── Paso 1: Cargar dataset (delegado a ingestion) ─────────────────────
        self._emit(job.execution_id, "Cargando dataset…")
        bundle = load_dataset(job.dataset_path, job.workspace_id, job.execution_id)
        X_train, y_train = bundle.X_train, bundle.y_train
        X_val,   y_val   = bundle.X_val,   bundle.y_val
        input_shape, num_classes = bundle.input_shape, bundle.num_classes

        # Actualizar num_classes con el valor real del dataset
        job.num_classes = num_classes
        log.info("Dataset listo: shape=%s classes=%d test=%s",
                 input_shape, num_classes, bundle.X_test is not None)
        self._emit(job.execution_id,
                   f"Dataset listo: {num_classes} clases · shape {input_shape}")

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
        })

        # ── Paso 3: Entrenar (delegado a Strategy) ────────────────────────────
        hp = HyperParams(
            epochs=job.epochs,
            batch_size=job.batch_size,
            architecture=job.architecture,
            learning_rate=job.learning_rate,
            num_classes=num_classes,
            input_shape=input_shape,
        )
        output_dir = self._prepare_output_dir(job)
        strategy   = self._select_strategy(job.framework)
        self._emit(job.execution_id,
                   f"Entrenando con {job.framework} · {job.epochs} epochs (batch {job.batch_size})…")

        def on_epoch(epoch: int, total: int, metrics: dict) -> None:
            self._emit(
                job.execution_id,
                f"Epoch {epoch}/{total} — loss={metrics.get('loss', 0):.4f} "
                f"acc={metrics.get('accuracy', 0):.4f}",
            )

        result: TrainingResult = strategy.train(
            X_train, y_train, X_val, y_val, hp, output_dir,
            X_test=bundle.X_test, y_test=bundle.y_test, on_epoch=on_epoch)

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

        # ── Paso 5: Registrar artefacto en MLflow ─────────────────────────────
        self._emit(job.execution_id, "Registrando modelo en el Model Registry de MLflow…")
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
            "hyperparameters": {
                "framework":     result.framework,
                "epochs":        job.epochs,
                "batch_size":    job.batch_size,
                "learning_rate": job.learning_rate,
                "num_classes":   num_classes,
                "input_shape":   str(input_shape),
            },
            "metrics": {
                "final_accuracy": result.final_accuracy,
                "final_loss":     result.final_loss,
                "test_accuracy":  result.test_accuracy,
                "test_loss":      result.test_loss,
            },
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