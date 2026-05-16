import json
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

from app.config import settings
from app.infra.mlflow_client import MLflowFacade
from app.pipeline.ingestion import load_dataset
from app.pipeline.preprocessing import build_preprocessing_strategy
from app.pipeline.training.base import HyperParams, TrainingResult
from app.pipeline.training.tensorflow_strategy import TensorFlowStrategy
from app.pipeline.training.pytorch_strategy import PyTorchStrategy
from app.pipeline.drift import generate_drift_report

log = logging.getLogger(__name__)


@dataclass
class PipelineJob:
    """Mensaje deserializado desde mlops.pipeline.requests."""
    workspace_id: str
    pipeline_id: str
    dataset_path: str
    framework: str           # "tensorflow" | "pytorch"
    architecture: str        # "cnn" | "mobilenet" | "resnet50"
    epochs: int
    batch_size: int
    learning_rate: float = 0.001
    preprocessing: str = "normalization"
    test_size: float = 0.2
    num_classes: int = 2
    validation_dataset_path: str | None = None

    @staticmethod
    def from_dict(data: dict) -> "PipelineJob":
        return PipelineJob(
            workspace_id=data["workspace_id"],
            pipeline_id=data["pipeline_id"],
            dataset_path=data["dataset_path"],
            framework=data.get("framework", "tensorflow"),
            architecture=data.get("architecture", "cnn"),
            epochs=int(data.get("epochs", 5)),
            batch_size=int(data.get("batch_size", 32)),
            learning_rate=float(data.get("learning_rate", 0.001)),
            preprocessing=data.get("preprocessing", "normalization"),
            test_size=float(data.get("test_size", 0.2)),
            num_classes=int(data.get("num_classes", 2)),
            validation_dataset_path=data.get("validation_dataset_path"),
        )


class PipelineExecutor:
    """
    Template Method — ADR-005.
    Orquesta el ciclo completo MLOps:
    ingest → preprocess → split → train → register → drift
    """

    def __init__(self) -> None:
        self._mlflow = MLflowFacade()

    def execute(self, job: PipelineJob) -> dict:
        log.info("Iniciando pipeline — workspace=%s pipeline=%s",
                 job.workspace_id, job.pipeline_id)

        output_dir = self._prepare_output_dir(job)

        # ── 1. Ingest ─────────────────────────────────────────────────────────
        X, y = load_dataset(job.dataset_path)
        log.info("Dataset cargado: shape=%s", X.shape)

        # ── 2. Preprocess ─────────────────────────────────────────────────────
        strategy = build_preprocessing_strategy(job.preprocessing)
        X = strategy.apply(X)

        # ── 3. Split ──────────────────────────────────────────────────────────
        if y is not None:
            X_train, X_val, y_train, y_val = train_test_split(
                X, y, test_size=job.test_size, stratify=y, random_state=42
            )
        else:
            split = int(len(X) * (1 - job.test_size))
            X_train, X_val = X[:split], X[split:]
            y_train = y_val = np.zeros(len(X_train), dtype=np.int64)

        log.info("Split: train=%d val=%d", len(X_train), len(X_val))

        # ── 4. MLflow run ─────────────────────────────────────────────────────
        experiment_id = self._mlflow.get_or_create_experiment(
            f"workspace_{job.workspace_id}"
        )
        run_id = self._mlflow.start_run(
            experiment_id=experiment_id,
            run_name=f"pipeline_{job.pipeline_id}",
        )

        try:
            hp = HyperParams(
                epochs=job.epochs,
                batch_size=job.batch_size,
                architecture=job.architecture,
                learning_rate=job.learning_rate,
                num_classes=job.num_classes,
            )
            self._mlflow.log_params({
                "framework": job.framework,
                "architecture": hp.architecture,
                "epochs": hp.epochs,
                "batch_size": hp.batch_size,
                "learning_rate": hp.learning_rate,
                "preprocessing": job.preprocessing,
                "test_size": job.test_size,
                "dataset_path": job.dataset_path,
            })

            # ── 5. Train ──────────────────────────────────────────────────────
            result = self._train(job, X_train, y_train, X_val, y_val,
                                 hp, output_dir)

            # Loguear métricas por epoch
            for step, (acc, loss) in enumerate(
                zip(result.history["accuracy"], result.history["loss"])
            ):
                self._mlflow.log_metric("accuracy", acc, step=step)
                self._mlflow.log_metric("loss", loss, step=step)
            for step, (acc, loss) in enumerate(
                zip(result.history.get("val_accuracy", []),
                    result.history.get("val_loss", []))
            ):
                self._mlflow.log_metric("val_accuracy", acc, step=step)
                self._mlflow.log_metric("val_loss", loss, step=step)

            # ── 6. Registrar artefacto ────────────────────────────────────────
            import mlflow
            mlflow.log_artifact(result.artifact_path, artifact_path="model")
            model_version = self._mlflow.register_model(
                run_id=run_id,
                model_name=f"model_workspace_{job.workspace_id}",
            )

            # ── 7. Drift report (opcional) ────────────────────────────────────
            if job.validation_dataset_path:
                X_ref, _ = load_dataset(job.validation_dataset_path)
                drift_path = generate_drift_report(X_ref, X_val, output_dir)
                if drift_path:
                    self._mlflow.log_artifact(drift_path)

            self._mlflow.end_run("FINISHED")
            log.info("Pipeline completado — run_id=%s version=%s",
                     run_id, model_version)

            return {
                "status": "SUCCESS",
                "workspace_id": job.workspace_id,
                "pipeline_id": job.pipeline_id,
                "run_id": run_id,
                "model_version": model_version,
                "framework": result.framework,
                "final_accuracy": result.final_accuracy,
                "final_loss": result.final_loss,
            }

        except Exception as e:
            log.exception("Error en pipeline: %s", e)
            self._mlflow.end_run("FAILED")
            return {
                "status": "FAILED",
                "workspace_id": job.workspace_id,
                "pipeline_id": job.pipeline_id,
                "error": str(e),
            }

    def _train(
        self,
        job: PipelineJob,
        X_train, y_train, X_val, y_val,
        hp: HyperParams,
        output_dir: str,
    ) -> TrainingResult:
        if job.framework == "pytorch":
            return PyTorchStrategy().train(
                X_train, y_train, X_val, y_val, hp, output_dir
            )
        return TensorFlowStrategy().train(
            X_train, y_train, X_val, y_val, hp, output_dir
        )

    def _prepare_output_dir(self, job: PipelineJob) -> str:
        path = Path(settings.storage_base_path) / job.workspace_id / "models" / job.pipeline_id
        path.mkdir(parents=True, exist_ok=True)
        return str(path)