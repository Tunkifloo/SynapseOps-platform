"""
Catálogo granular de Data Augmentation (mejora del nodo de Preprocesamiento).

Este módulo NO depende de TensorFlow ni PyTorch: define
  1) la normalización/validación del catálogo de técnicas que envía el frontend, y
  2) un augmentador *offline* (numpy + PIL) usado por el balanceo de clases para
     generar variantes sintéticas de las clases minoritarias.

Las estrategias de entrenamiento (TF/PyTorch) construyen su augmentation *in-graph*
a partir del MISMO catálogo normalizado (`normalize_config`), de modo que ambos
frameworks aplican las mismas técnicas con los mismos parámetros (paridad).

Catálogo (clave → parámetro principal · rango · default):
    flipH         prob      0.0–1.0   0.5      flipV         prob      0.0–1.0   0.5
    rotation      maxDeg    0–45      15       brightness    factor    0.0–1.0   0.2
    contrast      factor    0.0–1.0   0.2      saturation    factor    0.0–1.0   0.3
    sharpness     intensity 0.0–2.0   1.0      zoom          scale     0.0–0.5   0.1
    gaussianNoise std       0.0–0.1   0.02     translation   fraction  0.0–0.3   0.1
"""
from __future__ import annotations

import logging
from typing import Dict, Optional

import numpy as np
from PIL import Image, ImageEnhance

log = logging.getLogger(__name__)

# (param, default, lo, hi) por técnica. El orden define la secuencia de aplicación.
_SPEC: Dict[str, tuple] = {
    "flipH":         ("prob",      0.5,  0.0, 1.0),
    "flipV":         ("prob",      0.5,  0.0, 1.0),
    "rotation":      ("maxDeg",    15.0, 0.0, 45.0),
    "translation":   ("fraction",  0.1,  0.0, 0.3),
    "zoom":          ("scale",     0.1,  0.0, 0.5),
    "brightness":    ("factor",    0.2,  0.0, 1.0),
    "contrast":      ("factor",    0.2,  0.0, 1.0),
    "saturation":    ("factor",    0.3,  0.0, 1.0),
    "sharpness":     ("intensity", 1.0,  0.0, 2.0),
    "gaussianNoise": ("std",       0.02, 0.0, 0.1),
}

# Preset retrocompatible: equivale al toggle binario actual (flip+rotación+zoom).
_PRESET = {"flipH": {"prob": 0.5}, "rotation": {"maxDeg": 15.0}, "zoom": {"scale": 0.1}}


def _clamp(value, lo: float, hi: float, default: float) -> float:
    try:
        return float(min(max(float(value), lo), hi))
    except (TypeError, ValueError):
        return float(default)


def normalize_config(raw: Optional[dict], master_toggle: bool = False) -> Dict[str, dict]:
    """Devuelve solo las técnicas habilitadas con su parámetro saneado al rango.

    - `raw` vacío/None + `master_toggle` True  → preset retrocompatible.
    - `raw` vacío/None + `master_toggle` False → sin augmentation ({}).
    - Cada entrada de `raw` puede ser {"enabled": bool, "<param>": valor}.
    """
    if not raw:
        return dict(_PRESET) if master_toggle else {}

    out: Dict[str, dict] = {}
    for key, (param, default, lo, hi) in _SPEC.items():
        entry = raw.get(key)
        if not isinstance(entry, dict):
            continue
        enabled = str(entry.get("enabled", True)).lower() in ("true", "1", "yes")
        if not enabled:
            continue
        out[key] = {param: _clamp(entry.get(param, default), lo, hi, default)}
    return out


def summarize(cfg: Dict[str, dict]) -> str:
    """Resumen legible para logs/MLflow (p. ej. 'flipH(0.5)·rotation(15.0)')."""
    if not cfg:
        return "ninguna"
    parts = []
    for key, params in cfg.items():
        val = next(iter(params.values()), "")
        parts.append(f"{key}({val})")
    return "·".join(parts)


# ── Augmentador offline (numpy/PIL) — usado por el balanceo ──────────────────────
def augment_image(img: np.ndarray, cfg: Dict[str, dict], rng: np.random.Generator) -> np.ndarray:
    """Aplica el catálogo a UNA imagen float32 (H,W,3) en [0,1] y la devuelve igual.

    Cada técnica habilitada se aplica de forma estocástica para que dos llamadas con
    la misma imagen produzcan variantes distintas (evita copias idénticas en el
    oversampling). Robusto: ante error en una técnica, la omite.
    """
    if not cfg:
        return img
    arr = np.clip(img, 0.0, 1.0)
    pil = Image.fromarray((arr * 255.0).astype(np.uint8))

    if "flipH" in cfg and rng.random() < cfg["flipH"]["prob"]:
        pil = pil.transpose(Image.FLIP_LEFT_RIGHT)
    if "flipV" in cfg and rng.random() < cfg["flipV"]["prob"]:
        pil = pil.transpose(Image.FLIP_TOP_BOTTOM)
    if "rotation" in cfg:
        deg = float(rng.uniform(-1, 1) * cfg["rotation"]["maxDeg"])
        pil = pil.rotate(deg, resample=Image.BILINEAR, fillcolor=(0, 0, 0))
    if "translation" in cfg:
        frac = cfg["translation"]["fraction"]
        dx = int(rng.uniform(-1, 1) * frac * pil.width)
        dy = int(rng.uniform(-1, 1) * frac * pil.height)
        pil = pil.transform(pil.size, Image.AFFINE, (1, 0, dx, 0, 1, dy),
                            resample=Image.BILINEAR, fillcolor=(0, 0, 0))
    if "zoom" in cfg:
        scale = float(rng.uniform(0, cfg["zoom"]["scale"]))
        if scale > 0:
            w, h = pil.size
            dw, dh = int(w * scale / 2), int(h * scale / 2)
            box = (dw, dh, w - dw, h - dh)
            if box[2] > box[0] and box[3] > box[1]:
                pil = pil.crop(box).resize((w, h), Image.BILINEAR)
    if "brightness" in cfg:
        f = 1.0 + float(rng.uniform(-1, 1) * cfg["brightness"]["factor"])
        pil = ImageEnhance.Brightness(pil).enhance(max(0.0, f))
    if "contrast" in cfg:
        f = 1.0 + float(rng.uniform(-1, 1) * cfg["contrast"]["factor"])
        pil = ImageEnhance.Contrast(pil).enhance(max(0.0, f))
    if "saturation" in cfg:
        f = 1.0 + float(rng.uniform(-1, 1) * cfg["saturation"]["factor"])
        pil = ImageEnhance.Color(pil).enhance(max(0.0, f))
    if "sharpness" in cfg:
        # intensity: 1.0 = sin cambio; <1 difumina; >1 enfoca. Se jitterea hacia el valor.
        f = float(rng.uniform(1.0, cfg["sharpness"]["intensity"])) \
            if cfg["sharpness"]["intensity"] >= 1.0 \
            else float(rng.uniform(cfg["sharpness"]["intensity"], 1.0))
        pil = ImageEnhance.Sharpness(pil).enhance(f)

    out = np.asarray(pil, dtype=np.float32) / 255.0
    if "gaussianNoise" in cfg:
        std = cfg["gaussianNoise"]["std"]
        out = out + rng.normal(0.0, std, size=out.shape).astype(np.float32)
    return np.clip(out, 0.0, 1.0).astype(np.float32)
