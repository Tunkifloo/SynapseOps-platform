import logging
import time

import mlflow
from mlflow.tracking import MlflowClient

from app.config import settings

log = logging.getLogger(__name__)


class MLflowFacade:

    def __init__(self) -> None:
        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        self._client = MlflowClient(tracking_uri=settings.mlflow_tracking_uri)
        log.info("MLflowFacade inicializado → %s", settings.mlflow_tracking_uri)

    def get_or_create_experiment(self, name: str) -> str:
        exp = self._client.get_experiment_by_name(name)
        if exp is not None:
            return exp.experiment_id
        exp_id = self._client.create_experiment(name)
        log.info("Experimento creado: %s → id=%s", name, exp_id)
        return exp_id

    def start_run(self, experiment_id: str, run_name: str) -> str:
        run = self._client.create_run(
            experiment_id=experiment_id,
            run_name=run_name,
        )
        mlflow.start_run(run_id=run.info.run_id)
        log.info("Run iniciado: %s", run.info.run_id)
        return run.info.run_id

    def log_params(self, params: dict) -> None:
        for key, value in params.items():
            mlflow.log_param(key, value)

    def log_metric(self, key: str, value: float, step: int = 0) -> None:
        mlflow.log_metric(key, value, step=step)

    def log_artifact(self, local_path: str) -> None:
        mlflow.log_artifact(local_path)

    def register_model(self, run_id: str, model_name: str, max_retries: int = 3) -> str:
        """
        Registra el modelo en el Model Registry usando MlflowClient directamente.
        Compatible con MLflow server 2.21.3 — evita fluent API de MLflow 3.x.

        El registro forma parte del criterio de éxito del pipeline: se reintenta
        hasta `max_retries` veces y, si persiste el fallo, se lanza la excepción
        para que el executor marque la ejecución como FAILED (no se enmascara).
        """
        last_error: Exception | None = None
        for attempt in range(1, max_retries + 1):
            try:
                # Crear modelo registrado si no existe (idempotente).
                try:
                    self._client.create_registered_model(model_name)
                    log.info("Modelo registrado creado: %s", model_name)
                except Exception:
                    log.info("Modelo '%s' ya existe, creando nueva versión.", model_name)

                artifact_uri = self._client.get_run(run_id).info.artifact_uri
                source = f"{artifact_uri}/model"

                mv = self._client.create_model_version(
                    name=model_name, source=source, run_id=run_id,
                )
                log.info("Versión registrada: %s → v%s", model_name, mv.version)
                return mv.version

            except Exception as e:
                last_error = e
                log.warning("register_model intento %d/%d falló: %s",
                            attempt, max_retries, e)
                if attempt < max_retries:
                    time.sleep(2 * attempt)   # backoff lineal

        raise RuntimeError(
            f"No se pudo registrar el modelo '{model_name}' en MLflow tras "
            f"{max_retries} intentos: {last_error}")

    def end_run(self, status: str = "FINISHED") -> None:
        mlflow.end_run(status=status)