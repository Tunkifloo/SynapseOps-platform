from abc import ABC, abstractmethod
import numpy as np
from PIL import Image
import logging

log = logging.getLogger(__name__)


# ── Strategy Interface ────────────────────────────────────────────────────────
class PreprocessingStrategy(ABC):

    @abstractmethod
    def apply(self, X: np.ndarray) -> np.ndarray:
        pass


# ── Estrategias concretas ─────────────────────────────────────────────────────
class NormalizationStrategy(PreprocessingStrategy):
    """Normaliza valores al rango [0, 1]."""

    def apply(self, X: np.ndarray) -> np.ndarray:
        x_min, x_max = X.min(), X.max()
        if x_max - x_min == 0:
            return X
        normalized = (X - x_min) / (x_max - x_min)
        log.info("Normalización aplicada: min=%.4f max=%.4f", x_min, x_max)
        return normalized.astype(np.float32)


class ImageResizeStrategy(PreprocessingStrategy):
    """Redimensiona imágenes al tamaño objetivo."""

    def __init__(self, target_size: tuple[int, int] = (224, 224)) -> None:
        self.target_size = target_size

    def apply(self, X: np.ndarray) -> np.ndarray:
        img = Image.fromarray(X.astype(np.uint8))
        resized = img.resize(self.target_size, Image.BILINEAR)
        result = np.array(resized, dtype=np.float32) / 255.0
        log.info("Resize aplicado: → %s", self.target_size)
        return result


# ── Factory según tipo de preprocesamiento ────────────────────────────────────
def build_preprocessing_strategy(
    preprocessing_type: str,
    image_size: tuple[int, int] = (224, 224),
) -> PreprocessingStrategy:
    strategies = {
        "normalization": NormalizationStrategy(),
        "resize": ImageResizeStrategy(target_size=image_size),
    }
    strategy = strategies.get(preprocessing_type)
    if strategy is None:
        raise ValueError(f"Estrategia desconocida: {preprocessing_type}")
    return strategy