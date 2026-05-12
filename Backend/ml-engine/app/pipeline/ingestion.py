import pandas as pd
import numpy as np
from pathlib import Path
from PIL import Image
import logging

log = logging.getLogger(__name__)


def load_dataset(dataset_path: str) -> tuple[np.ndarray, np.ndarray | None]:
    """
    Carga el dataset según la extensión del archivo.
    Retorna (X, y) donde y puede ser None si no hay columna target.
    """
    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset no encontrado: {dataset_path}")

    suffix = path.suffix.lower()

    if suffix == ".csv":
        return _load_csv(path)
    elif suffix in (".png", ".jpg", ".jpeg"):
        return _load_image(path)
    else:
        raise ValueError(f"Formato no soportado: {suffix}")


def _load_csv(path: Path) -> tuple[np.ndarray, np.ndarray | None]:
    df = pd.read_csv(path)
    log.info("CSV cargado: %s filas × %s columnas", *df.shape)

    # Última columna como target si existe más de una columna
    if df.shape[1] > 1:
        X = df.iloc[:, :-1].values.astype(np.float32)
        y = df.iloc[:, -1].values
        return X, y

    return df.values.astype(np.float32), None


def _load_image(path: Path) -> tuple[np.ndarray, None]:
    img = Image.open(path).convert("RGB")
    X = np.array(img, dtype=np.float32)
    log.info("Imagen cargada: shape=%s", X.shape)
    return X, None