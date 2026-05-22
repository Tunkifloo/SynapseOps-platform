from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Tuple
import numpy as np


@dataclass
class HyperParams:
    epochs:        int
    batch_size:    int
    architecture:  str            # "cnn" — adaptativa al input_shape
    learning_rate: float = 0.001
    num_classes:   int   = 10
    input_shape:   Tuple = (28, 28, 1)   # ← detectado en ingestion


@dataclass
class TrainingResult:
    framework:      str
    history:        dict    # {"accuracy": [...], "loss": [...], ...}
    artifact_path:  str     # path local del modelo guardado
    final_accuracy: float
    final_loss:     float


class TrainingStrategy(ABC):
    """
    Strategy
    Cada implementación encapsula un framework ML específico.
    El executor elige la estrategia según job.framework.
    """

    @abstractmethod
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val:   np.ndarray,
        y_val:   np.ndarray,
        hyperparams: HyperParams,
        output_dir:  str,
    ) -> TrainingResult:
        pass