from abc import ABC, abstractmethod
from dataclasses import dataclass
import numpy as np


@dataclass
class HyperParams:
    epochs: int
    batch_size: int
    architecture: str        # "cnn" | "mobilenet" | "resnet50"
    learning_rate: float = 0.001
    num_classes: int = 2


@dataclass
class TrainingResult:
    framework: str
    history: dict            # {"accuracy": [...], "loss": [...]}
    artifact_path: str       # path local del modelo guardado (.h5 o .pt)
    final_accuracy: float
    final_loss: float


class TrainingStrategy(ABC):

    @abstractmethod
    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        hyperparams: HyperParams,
        output_dir: str,
    ) -> TrainingResult:
        pass