import mlflow
from mlflow.tracking import MlflowClient

from app.config import settings

import logging

log = logging.getLogger(__name__)


class MLflowFacade:
    """Facade sobre el MLflow Tracking Server — ADR-007."""

    def __init__(self) -> None:
        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        self._client = MlflowClient()
        log.info("MLflowFacade inicializado → %s", settings.mlflow_tracking_uri)

    def get_or_create_experiment(self, name: str) -> str:
        exp = mlflow.get_experiment_by_name(name)
        if exp is not None:
            return exp.experiment_id
        experiment_id = mlflow.create_experiment(name)
        log.info("Experimento creado: %s (id=%s)", name, experiment_id)
        return experiment_id

    def start_run(self, experiment_id: str, run_name: str) -> str:
        run = mlflow.start_run(
            experiment_id=experiment_id,
            run_name=run_name,
        )
        log.info("Run iniciado: %s", run.info.run_id)
        return run.info.run_id

    def log_params(self, params: dict) -> None:
        mlflow.log_params(params)

    def log_metric(self, key: str, value: float, step: int) -> None:
        mlflow.log_metric(key, value, step=step)

    def log_artifact(self, local_path: str) -> None:
        mlflow.log_artifact(local_path)

    def register_model(self, run_id: str, model_name: str) -> str:
        model_uri = f"runs:/{run_id}/model"
        result = mlflow.register_model(model_uri=model_uri, name=model_name)
        log.info("Modelo registrado: %s → versión %s", model_name, result.version)
        return result.version

    def end_run(self, status: str = "FINISHED") -> None:
        mlflow.end_run(status=status)