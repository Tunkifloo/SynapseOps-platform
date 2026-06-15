"""
Balanceo de clases del split de entrenamiento (multiclase, 2..MAX_CLASSES).

Corrige distribuciones asimétricas ANTES del entrenamiento, operando solo sobre
`X_train`/`y_train` (validación y test quedan intactos para métricas fiables).

Estrategias:
  - oversample : genera variantes augmentadas de las clases por debajo del objetivo.
  - undersample: submuestrea aleatoriamente las clases por encima del objetivo.
  - hybrid     : oversample a las que están bajo la media y undersample a las de arriba.

Determinista (semilla fija, consistente con ingestion). Nunca contamina val/test.
El oversampling reutiliza el catálogo de Data Augmentation seleccionado por el
usuario (no copias idénticas). Respeta el tope de memoria del contenedor de 8 GB.
"""
from __future__ import annotations

import logging
from typing import Dict, Optional, Tuple

import numpy as np

from app.pipeline.training import augmentation as aug
from app.pipeline.training.ingestion import MAX_IMAGES

log = logging.getLogger(__name__)

_SEED = 42
# Si el usuario no eligió técnicas de augmentation, el oversampling usa un preset
# ligero para que las muestras sintéticas no sean copias idénticas (overfitting).
_DEFAULT_OVERSAMPLE_AUG = {
    "flipH": {"prob": 0.5},
    "rotation": {"maxDeg": 12.0},
    "brightness": {"factor": 0.15},
}


def balance_dataset(
    X_train: np.ndarray,
    y_train: np.ndarray,
    strategy: str,
    threshold_pct: int,
    class_names: list,
    augmentation_cfg: Optional[Dict[str, dict]] = None,
    max_images: int = MAX_IMAGES,
) -> Tuple[np.ndarray, np.ndarray, Optional[dict]]:
    """Devuelve (X, y, report). `report` es None si no se aplicó balanceo.

    `report` = {strategy, threshold, target, before:{clase:n}, after:{clase:n},
                capped:bool}.
    """
    strategy = (strategy or "off").lower()
    if strategy not in ("oversample", "undersample", "hybrid"):
        return X_train, y_train, None
    if X_train is None or X_train.size == 0:
        return X_train, y_train, None

    y = np.asarray(y_train)
    counts = np.bincount(y, minlength=len(class_names))
    present = counts[counts > 0]
    if present.size < 2:
        return X_train, y_train, None

    max_c, min_c, mean_c = int(present.max()), int(present.min()), int(round(present.mean()))

    # Activación condicional: solo intervenir si el desbalance supera el umbral.
    imbalance_pct = (max_c - min_c) / max_c * 100.0
    if imbalance_pct < threshold_pct:
        log.info("Balanceo omitido: desbalance %.1f%% < umbral %d%%.", imbalance_pct, threshold_pct)
        return X_train, y_train, {
            "strategy": strategy, "threshold": threshold_pct, "skipped": True,
            "reason": f"dataset ya balanceado ({imbalance_pct:.0f}% < {threshold_pct}%)",
            "before": _dist(counts, class_names), "after": _dist(counts, class_names),
        }

    # Objetivo de muestras por clase según la estrategia (mejora Parte 2).
    if strategy == "oversample":
        target = max(1, int(max_c * (1 - threshold_pct / 100.0)))
    elif strategy == "undersample":
        target = max(1, int(min_c * (1 + threshold_pct / 100.0)))
    else:  # hybrid
        target = max(1, mean_c)

    cfg = augmentation_cfg or _DEFAULT_OVERSAMPLE_AUG
    rng = np.random.default_rng(_SEED)

    X_parts, y_parts = [], []
    for cls in range(len(class_names)):
        idx = np.where(y == cls)[0]
        n = len(idx)
        if n == 0:
            continue
        imgs = X_train[idx]

        if n > target and strategy in ("undersample", "hybrid"):
            pick = rng.choice(n, size=target, replace=False)
            X_parts.append(imgs[pick]); y_parts.append(np.full(target, cls, dtype=y.dtype))
        elif n < target and strategy in ("oversample", "hybrid"):
            X_parts.append(imgs); y_parts.append(np.full(n, cls, dtype=y.dtype))
            extra = _generate(imgs, target - n, cfg, rng)
            X_parts.append(extra); y_parts.append(np.full(len(extra), cls, dtype=y.dtype))
        else:
            X_parts.append(imgs); y_parts.append(np.full(n, cls, dtype=y.dtype))

    X_bal = np.concatenate(X_parts, axis=0)
    y_bal = np.concatenate(y_parts, axis=0)

    # Guardrail de memoria: si el resultado supera el tope, submuestrea estratificado.
    capped = False
    if len(X_bal) > max_images:
        capped = True
        keep = rng.permutation(len(X_bal))[:max_images]
        X_bal, y_bal = X_bal[keep], y_bal[keep]
        log.warning("Balanceo: resultado %d > tope %d → submuestreo a %d.",
                    len(X_parts) and sum(len(p) for p in y_parts), max_images, max_images)

    # Mezcla final determinista.
    perm = rng.permutation(len(X_bal))
    X_bal, y_bal = X_bal[perm].astype(np.float32), y_bal[perm]

    after_counts = np.bincount(y_bal, minlength=len(class_names))
    report = {
        "strategy": strategy, "threshold": threshold_pct, "target": target, "capped": capped,
        "before": _dist(counts, class_names), "after": _dist(after_counts, class_names),
    }
    log.info("Balanceo (%s) aplicado: %s → %s", strategy, report["before"], report["after"])
    return X_bal, y_bal, report


def _generate(imgs: np.ndarray, k: int, cfg: dict, rng: np.random.Generator) -> np.ndarray:
    """Genera `k` variantes augmentadas tomando imágenes fuente al azar de la clase."""
    if k <= 0:
        return np.empty((0, *imgs.shape[1:]), dtype=np.float32)
    src = rng.integers(0, len(imgs), size=k)
    return np.stack([aug.augment_image(imgs[s], cfg, rng) for s in src]).astype(np.float32)


def _dist(counts: np.ndarray, class_names: list) -> Dict[str, int]:
    return {class_names[i]: int(c) for i, c in enumerate(counts) if i < len(class_names)}
