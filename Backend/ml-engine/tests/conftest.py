"""Asegura que el paquete `app` sea importable al ejecutar pytest desde cualquier cwd."""
import sys
from pathlib import Path

ML_ENGINE_ROOT = Path(__file__).resolve().parent.parent
if str(ML_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ENGINE_ROOT))


def pytest_configure(config):
    """Baja MIN_IMAGES a 2 para que los tests de ingesta corran con datasets livianos."""
    from app.pipeline.training import ingestion
    ingestion.MIN_IMAGES = 2
