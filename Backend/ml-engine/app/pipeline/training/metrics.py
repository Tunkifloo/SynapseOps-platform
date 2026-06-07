"""
Métricas de clasificación avanzadas (item 7).

Calcula precision/recall/f1 (macro), ROC AUC (one-vs-rest macro) y la matriz de
confusión a partir de las predicciones sobre un split. Robusto a clases ausentes.
"""
import logging
from typing import Dict, List, Optional

import numpy as np

log = logging.getLogger(__name__)


def compute_classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_proba: Optional[np.ndarray],
    num_classes: int,
    prefix: str = "val",
) -> Dict[str, float]:
    """Métricas escalares (con prefijo `val_`/`test_`). Nunca lanza: ante error, omite."""
    from sklearn.metrics import (
        f1_score, precision_score, recall_score, roc_auc_score,
    )
    out: Dict[str, float] = {}
    try:
        labels = list(range(num_classes))
        out[f"{prefix}_precision"] = float(
            precision_score(y_true, y_pred, average="macro", zero_division=0, labels=labels))
        out[f"{prefix}_recall"] = float(
            recall_score(y_true, y_pred, average="macro", zero_division=0, labels=labels))
        out[f"{prefix}_f1"] = float(
            f1_score(y_true, y_pred, average="macro", zero_division=0, labels=labels))
        if y_proba is not None and num_classes >= 2:
            try:
                if num_classes == 2:
                    auc = roc_auc_score(y_true, y_proba[:, 1])
                else:
                    auc = roc_auc_score(
                        y_true, y_proba, multi_class="ovr", average="macro", labels=labels)
                out[f"{prefix}_roc_auc"] = float(auc)
            except Exception as e:  # noqa: BLE001
                log.debug("ROC AUC no disponible (%s): %s", prefix, e)
    except Exception as e:  # noqa: BLE001
        log.warning("No se pudieron calcular métricas avanzadas (%s): %s", prefix, e)
    return out


def confusion_matrix_payload(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    class_names: List[str],
    num_classes: int,
) -> Optional[dict]:
    """Matriz de confusión como dict serializable a JSON (para render en el frontend)."""
    try:
        from sklearn.metrics import confusion_matrix
        labels = list(range(num_classes))
        cm = confusion_matrix(y_true, y_pred, labels=labels)
        return {
            "labels": class_names if len(class_names) == num_classes
            else [str(i) for i in labels],
            "matrix": cm.astype(int).tolist(),
        }
    except Exception as e:  # noqa: BLE001
        log.warning("No se pudo construir la matriz de confusión: %s", e)
        return None
