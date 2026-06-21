from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Callable, Optional, Tuple
import numpy as np

# Callback de progreso por epoch: (epoch_actual, total_epochs, métricas) -> None
EpochCallback = Callable[[int, int, dict], None]
# Callback de inicio de fase (Transfer Learning): recibe un dict descriptivo de la fase.
PhaseCallback = Callable[[dict], None]
# Callback de eventos del ciclo (early stopping, inicio de evaluación, interpretabilidad):
# (mensaje, nivel) -> None. Lo usa el executor para emitir SSE en el entreno FINAL (no en HPO).
EventCallback = Callable[[str, str], None]


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
    # ── Regularización (configurable; aplica a la CNN adaptativa y a las cabezas TL) ──
    dropout: float = 0.4                 # dropout de la cabeza densa
    l2:      float = 0.0                 # regularización L2 / weight decay
    # ── Transfer Learning (2 fases: feature-extraction → fine-tuning) ─────────
    feature_extraction_epochs: int   = 5
    feature_extraction_lr:     float = 1e-3
    finetuning_epochs:         int   = 10
    finetuning_lr:             float = 1e-5
    unfreeze_layers:           int   = 10


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
    # Se incluye train para comparar simétricamente los tres splits.
    train_true:  Optional[np.ndarray] = None
    train_pred:  Optional[np.ndarray] = None
    train_proba: Optional[np.ndarray] = None
    val_true:   Optional[np.ndarray] = None
    val_pred:   Optional[np.ndarray] = None
    val_proba:  Optional[np.ndarray] = None
    test_true:  Optional[np.ndarray] = None
    test_pred:  Optional[np.ndarray] = None
    test_proba: Optional[np.ndarray] = None
    # Galería de interpretabilidad Score-CAM (PNG local), si se pudo generar.
    interpretability_path: Optional[str] = None


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
        class_names: Optional[list] = None,
        on_phase: Optional[PhaseCallback] = None,
        on_event: Optional[EventCallback] = None,
        quick: bool = False,
    ) -> TrainingResult:
        """`quick=True` (HPO): entrena y devuelve solo el history (métricas de validación);
        omite predicciones completas, evaluación de test, Score-CAM y guardado del artefacto.
        Sirve para evaluar candidatos de hiperparámetros de forma barata."""
        pass