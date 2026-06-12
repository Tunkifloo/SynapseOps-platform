"""
Detección de data drift para imágenes, interpretable y robusta.

Estrategia: en vez de comparar 64×64×3 = 12 288 píxeles crudos (caro y opaco para
Evidently), se extraen FEATURES COMPACTAS por imagen (media/σ por canal, brillo,
contraste). Sobre esas features:
  - Señal numérica propia vía PSI (Population Stability Index) — NO depende de la
    versión de Evidently, siempre disponible para la UI.
  - Reporte Evidently (DataDriftPreset) como artefacto auditable para MLflow (best-effort).

Se usa para tres comparaciones (ver executor): train vs val/test (calidad del split),
dataset actual vs anterior (re-entrenamiento) e inferencia vs entrenamiento (model-service).
"""
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

log = logging.getLogger(__name__)

FEATURE_NAMES: List[str] = [
    "mean_r", "mean_g", "mean_b",
    "std_r", "std_g", "std_b",
    "brightness", "contrast",
]

# Umbrales PSI estándar (Population Stability Index).
_PSI_MODERATE = 0.10
_PSI_SIGNIFICANT = 0.25
# El dataset se considera "con deriva" si ≥30% de las features superan el umbral.
_DRIFT_SHARE_THRESHOLD = 0.30
_MAX_SAMPLE = 4000   # filas máximas a usar/persistir (coste acotado)


def extract_features(X: np.ndarray) -> np.ndarray:
    """(N, H, W, C) en [0,1] → (N, 8) features compactas e interpretables."""
    if X is None or X.size == 0:
        return np.empty((0, len(FEATURE_NAMES)), dtype=np.float32)
    arr = np.asarray(X, dtype=np.float32)
    if arr.ndim == 3:                      # (N, H, W) → añade canal
        arr = arr[..., np.newaxis]
    n, _, _, c = arr.shape
    # Media/σ por canal (sobre H, W). Para grises (C=1) se replica a 3 canales.
    mean_c = arr.mean(axis=(1, 2))         # (N, C)
    std_c = arr.std(axis=(1, 2))           # (N, C)
    if c == 1:
        mean_c = np.repeat(mean_c, 3, axis=1)
        std_c = np.repeat(std_c, 3, axis=1)
    else:
        mean_c, std_c = mean_c[:, :3], std_c[:, :3]
    brightness = arr.mean(axis=(1, 2, 3)).reshape(n, 1)
    contrast = arr.std(axis=(1, 2, 3)).reshape(n, 1)
    return np.concatenate([mean_c, std_c, brightness, contrast], axis=1).astype(np.float32)


def _psi(ref: np.ndarray, cur: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index entre dos muestras de una feature (deciles del ref)."""
    ref = ref[np.isfinite(ref)]
    cur = cur[np.isfinite(cur)]
    if ref.size == 0 or cur.size == 0:
        return 0.0
    edges = np.quantile(ref, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    if len(np.unique(edges)) < 3:          # feature casi constante → sin deriva medible
        return 0.0
    ref_pct = np.histogram(ref, bins=edges)[0] / len(ref)
    cur_pct = np.histogram(cur, bins=edges)[0] / len(cur)
    eps = 1e-6
    ref_pct = np.clip(ref_pct, eps, None)
    cur_pct = np.clip(cur_pct, eps, None)
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def compute_drift(ref_feats: np.ndarray, cur_feats: np.ndarray) -> Optional[Dict]:
    """Señal de drift por feature (PSI) + veredicto agregado. None si no hay datos."""
    if ref_feats.size == 0 or cur_feats.size == 0:
        return None
    per_feature: Dict[str, float] = {}
    for i, name in enumerate(FEATURE_NAMES):
        per_feature[name] = round(_psi(ref_feats[:, i], cur_feats[:, i]), 4)
    psis = np.array(list(per_feature.values()))
    drifted = [n for n, p in per_feature.items() if p >= _PSI_SIGNIFICANT]
    share = float(len(drifted) / len(per_feature))
    max_psi = float(psis.max())
    if max_psi < _PSI_MODERATE:
        severity = "none"
    elif max_psi < _PSI_SIGNIFICANT:
        severity = "moderate"
    else:
        severity = "significant"
    return {
        "drifted": bool(share >= _DRIFT_SHARE_THRESHOLD or max_psi >= _PSI_SIGNIFICANT),
        "severity": severity,
        "share_drifted": round(share, 4),
        "max_psi": round(max_psi, 4),
        "n_features": len(per_feature),
        "drifted_features": drifted,
        "per_feature": per_feature,
    }


def evidently_report(ref_feats: np.ndarray, cur_feats: np.ndarray,
                     output_dir: str, tag: str) -> Optional[str]:
    """Reporte Evidently (DataDriftPreset) sobre las features → JSON artefacto. Best-effort."""
    if ref_feats.size == 0 or cur_feats.size == 0:
        return None
    try:
        import pandas as pd
        from evidently import Report
        from evidently.presets import DataDriftPreset

        ref_df = pd.DataFrame(ref_feats, columns=FEATURE_NAMES)
        cur_df = pd.DataFrame(cur_feats, columns=FEATURE_NAMES)
        report = Report(metrics=[DataDriftPreset()])
        # Evidently ≥0.7: run() DEVUELVE el snapshot (con save_json); versiones previas
        # guardaban desde el propio Report. Se soporta ambas APIs.
        snapshot = report.run(reference_data=ref_df, current_data=cur_df)
        out = str(Path(output_dir) / f"drift_{tag}.json")
        target = snapshot if hasattr(snapshot, "save_json") else report
        target.save_json(out)
        log.info("Drift report (Evidently) generado → %s", out)
        return out
    except ImportError as e:
        log.warning("Evidently no disponible: %s", e)
        return None
    except Exception as e:  # noqa: BLE001 — el artefacto es complementario, no crítico
        log.warning("No se pudo generar el drift report de Evidently (%s): %s", tag, e)
        return None


def save_reference(X: np.ndarray, path: str) -> None:
    """Persiste una muestra de features como huella del dataset (para drift de
    re-entrenamiento e inferencia). JSON ligero — no guarda imágenes."""
    feats = extract_features(X)
    if feats.size == 0:
        return
    if len(feats) > _MAX_SAMPLE:
        rng = np.random.default_rng(42)
        feats = feats[rng.choice(len(feats), _MAX_SAMPLE, replace=False)]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"feature_names": FEATURE_NAMES, "features": feats.tolist()}, f)


def load_reference(path: str) -> Optional[np.ndarray]:
    """Carga la huella de features previa (o None si no existe / es inválida)."""
    p = Path(path)
    if not p.exists():
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return np.asarray(data.get("features", []), dtype=np.float32)
    except Exception as e:  # noqa: BLE001
        log.warning("No se pudo leer la referencia de drift %s: %s", path, e)
        return None
