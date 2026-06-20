import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.metrics import router as metrics_router
from app.kafka.consumer import PipelineConsumer
from app.config import settings

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s [%(threadName)s] %(levelname)s %(name)s - %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────
    # El consumidor se crea AQUÍ (no a nivel de módulo) para que importar main.py NO tenga
    # efectos secundarios: clave para el aislamiento por subproceso 'spawn' (Fase 3), que
    # re-importa el módulo principal en el hijo. Ver app/pipeline/runner.py.
    log.info("ml-engine arrancando...")
    consumer = PipelineConsumer()
    app.state.consumer = consumer
    consumer.start()
    yield
    # ── Shutdown ──────────────────────────────────────────
    log.info("ml-engine apagando...")
    consumer.stop()


app = FastAPI(
    title="SynapseOps ml-engine",
    description="Motor de entrenamiento MLOps — FastAPI + TF/PyTorch + MLflow",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(metrics_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=False,
    )