from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Callable, Optional, Tuple
import numpy as np

# Callback de progreso por epoch: (epoch_actual, total_epochs, métricas) -> None
EpochCallback = Callable[[int, int, dict], None]


@dataclass
class HyperParams:
    epochs:        int
    batch_size:    int
    architecture:  str            # "cnn" — adaptativa al input_shape
    learning_rate: float = 0.001
    num_classes:   int   = 10
    input_shape:   Tuple = (28, 28, 1)   # ← detectado en ingestion
    # ── Mejoras de entrenamiento (item 6) ───────────────────────────────────
    optimizer:        str  = "adam"      # adam | adamw | sgd | rmsprop
    batch_norm:       bool = False       # Batch Normalization en la CNN
    early_stopping:   bool = False
    es_patience:      int  = 3
    es_monitor:       str  = "val_loss"  # val_loss | val_accuracy
    data_augmentation: bool = False      # toggle maestro de augmentation (img)
    # Catálogo granular de augmentation ya normalizado (clave→{param:valor}).
    # Vacío + data_augmentation=True → las estrategias aplican el preset retrocompatible.
    augmentation_config: dict = field(default_factory=dict)


@dataclass
class TrainingResult:
    framework:      str
    history:        dict    # {"accuracy": [...], "loss": [...], ...}
    artifact_path:  str     # path local del modelo guardado
    final_accuracy: float
    final_loss:     float
    # Métricas sobre el split de test (si el dataset lo incluye).
    test_accuracy:  Optional[float] = None
    test_loss:      Optional[float] = None
    # ── Predicciones para métricas avanzadas (item 7) ────────────────────────
    # El executor calcula precision/recall/f1/roc_auc + matriz de confusión.
    val_true:   Optional[np.ndarray] = None
    val_pred:   Optional[np.ndarray] = None
    val_proba:  Optional[np.ndarray] = None
    test_true:  Optional[np.ndarray] = None
    test_pred:  Optional[np.ndarray] = None
    test_proba: Optional[np.ndarray] = None


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
        X_test:  Optional[np.ndarray] = None,
        y_test:  Optional[np.ndarray] = None,
        on_epoch: Optional[EpochCallback] = None,
    ) -> TrainingResult:
        pass