from fastapi import APIRouter, Response
from prometheus_client import (
    Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
)

router = APIRouter()

# ── Métricas expuestas a Prometheus ───────────────────────────────────────────
pipeline_runs_total = Counter(
    "ml_engine_pipeline_runs_total",
    "Total de pipelines ejecutados",
    ["status"],          # labels: success | failed
)

training_duration_seconds = Histogram(
    "ml_engine_training_duration_seconds",
    "Duración del entrenamiento en segundos",
    ["framework"],       # labels: tensorflow | pytorch
    buckets=[10, 30, 60, 120, 300, 600, float("inf")],
)


@router.get("/metrics", tags=["Observability"])
async def metrics() -> Response:
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )