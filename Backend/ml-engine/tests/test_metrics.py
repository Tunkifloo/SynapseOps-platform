"""
Tests de métricas de clasificación (app.pipeline.training.metrics).

Cubre precision/recall/f1 (macro), ROC-AUC y la matriz de confusión que la plataforma
muestra tras el entrenamiento. Requiere scikit-learn; si no está instalado, se omite
(en el CI ligero se instala explícitamente para que estos tests corran).
"""
import numpy as np
import pytest

pytest.importorskip("sklearn")

from app.pipeline.training import metrics


def test_perfect_binary_metrics():
    y = np.array([0, 0, 1, 1])
    proba = np.array([[0.9, 0.1], [0.8, 0.2], [0.2, 0.8], [0.1, 0.9]])
    pred = proba.argmax(axis=1)
    out = metrics.compute_classification_metrics(y, pred, proba, num_classes=2, prefix="test")
    assert out["test_precision"] == 1.0
    assert out["test_recall"] == 1.0
    assert out["test_f1"] == 1.0
    assert out["test_roc_auc"] == 1.0


def test_imperfect_metrics_in_range():
    y = np.array([0, 0, 1, 1, 0, 1])
    pred = np.array([0, 1, 1, 0, 0, 1])
    out = metrics.compute_classification_metrics(y, pred, None, num_classes=2)
    for k in ("val_precision", "val_recall", "val_f1"):
        assert 0.0 <= out[k] <= 1.0
    assert "val_roc_auc" not in out          # sin proba → no se calcula AUC


def test_confusion_matrix_payload():
    y = np.array([0, 0, 1, 1])
    pred = np.array([0, 1, 1, 1])
    cm = metrics.confusion_matrix_payload(y, pred, ["gato", "perro"], 2)
    assert cm["labels"] == ["gato", "perro"]
    assert cm["matrix"] == [[1, 1], [0, 2]]


def test_confusion_matrix_falls_back_labels_on_mismatch():
    y = np.array([0, 1, 2])
    pred = np.array([0, 1, 2])
    cm = metrics.confusion_matrix_payload(y, pred, ["solo_una"], 3)
    assert cm["labels"] == ["0", "1", "2"]   # nombres incompletos → índices
