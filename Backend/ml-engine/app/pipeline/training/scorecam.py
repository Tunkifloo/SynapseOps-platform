"""
Interpretabilidad por Score-CAM (galería en entrenamiento).

Genera, tras entrenar, una galería de mapas de calor Score-CAM sobre una muestra
pequeña del split de test (aciertos + errores), que se guarda como artefacto PNG en
MLflow. Sirve para que el usuario "vea" en qué se fija el modelo al decidir.

- Multiclase (softmax/argmax; los notebooks de referencia eran binarios sigmoide).
- Paridad TensorFlow / PyTorch: misma técnica, distinta forma de extraer activaciones.
- Best-effort: cualquier fallo se traga y devuelve None (nunca rompe el entrenamiento).
- Sin matplotlib: render con PIL + colormap jet en numpy.

Score-CAM: para los top-k canales del último mapa conv, se enmascara la entrada con
la activación (upsample+normalizada), se vuelve a inferir y el peso del canal es el
score de la clase predicha. La combinación ponderada → ReLU → normalización es el CAM.
"""
from __future__ import annotations

import logging
import os
from typing import List, Optional

import numpy as np
from PIL import Image, ImageDraw

log = logging.getLogger(__name__)

_TOP_K = 16        # canales a sondear por imagen (compromiso costo/calidad en CPU)
_POOL = 48         # tamaño máx. del pool del que se eligen las muestras
_CELL = 132        # lado de cada celda en la galería


def generate(framework: str, model, X: np.ndarray, y_true, class_names: Optional[list],
             output_dir: str, max_samples: int = 6, device=None) -> Optional[str]:
    """Devuelve la ruta del PNG de la galería, o None si no se pudo generar."""
    try:
        if X is None or len(X) == 0:
            return None
        pool = min(len(X), _POOL)
        Xs = np.asarray(X[:pool], dtype=np.float32)
        ys = np.asarray(y_true[:pool])

        if framework == "tensorflow":
            preds, confs, cam_fn, cleanup = _tf_prepare(model, Xs)
        else:
            preds, confs, cam_fn, cleanup = _torch_prepare(model, Xs, device)

        try:
            idxs = _select(ys, preds, max_samples)
            rows = []
            for i in idxs:
                cam = cam_fn(int(i))
                if cam is None:
                    continue
                rows.append({
                    "orig": _to_rgb(Xs[i]),
                    "heat": _jet(cam),
                    "over": _overlay(_to_rgb(Xs[i]), cam),
                    "true": _name(class_names, int(ys[i])),
                    "pred": _name(class_names, int(preds[i])),
                    "conf": float(confs[i]),
                    "ok": int(ys[i]) == int(preds[i]),
                })
            if not rows:
                return None
            return _render(rows, output_dir)
        finally:
            if cleanup:
                cleanup()
    except Exception as e:  # noqa: BLE001 — interpretabilidad complementaria
        log.warning("Score-CAM: no se pudo generar la galería (%s)", e)
        return None


# ── Selección de muestras (errores primero, luego aciertos; variada por clase) ──
def _select(y_true: np.ndarray, y_pred: np.ndarray, k: int) -> List[int]:
    errors = [i for i in range(len(y_true)) if y_true[i] != y_pred[i]]
    correct = [i for i in range(len(y_true)) if y_true[i] == y_pred[i]]
    half = max(1, k // 2)
    chosen = errors[:half] + correct[: k - len(errors[:half])]
    return chosen[:k] if chosen else list(range(min(k, len(y_true))))


# ── Backends de activaciones ────────────────────────────────────────────────────
def _tf_prepare(model, X):
    import tensorflow as tf

    probs = np.asarray(model.predict(X, verbose=0))
    preds, confs = probs.argmax(1), probs.max(1)

    target = None
    for layer in reversed(model.layers):
        try:
            if len(layer.output.shape) == 4:
                target = layer
                break
        except Exception:  # noqa: BLE001
            continue
    act_model = tf.keras.Model(model.inputs, target.output) if target is not None else None

    def cam_fn(i):
        if act_model is None:
            return None
        img = X[i]
        acts = np.asarray(act_model.predict(img[None], verbose=0))[0]   # (h,w,C)
        cls = int(preds[i])
        C = acts.shape[-1]
        top = np.argsort(acts.reshape(-1, C).mean(0))[::-1][:min(_TOP_K, C)]
        H, W = img.shape[0], img.shape[1]
        masked = np.stack([img * _resize01(acts[..., k], (H, W))[..., None] for k in top])
        scores = np.asarray(model.predict(masked, verbose=0))[:, cls]
        w = scores - scores.min()
        cam = np.tensordot(w, acts[..., top], axes=(0, 2))
        return _resize01(np.maximum(cam, 0), (H, W))

    return preds, confs, cam_fn, None


def _torch_prepare(model, X, device):
    import torch
    import torch.nn.functional as F

    model.eval()
    target = _torch_target_layer(model)
    Xt = torch.tensor(np.transpose(X, (0, 3, 1, 2)), dtype=torch.float32).to(device)

    probs = []
    with torch.no_grad():
        for i in range(0, len(Xt), 16):
            probs.append(torch.softmax(model(Xt[i:i + 16]), 1).cpu().numpy())
    probs = np.concatenate(probs)
    preds, confs = probs.argmax(1), probs.max(1)

    holder = {}
    handle = target.register_forward_hook(
        lambda m, inp, out: holder.update(a=out.detach())) if target is not None else None

    def cam_fn(i):
        if target is None:
            return None
        xi = Xt[i:i + 1]
        with torch.no_grad():
            model(xi)
        acts = holder["a"][0]                       # (C,h,w)
        cls = int(preds[i])
        C, h, w = acts.shape
        H, W = X.shape[1], X.shape[2]
        top = torch.topk(acts.abs().mean(dim=(1, 2)), min(_TOP_K, C)).indices.tolist()
        masked = []
        for k in top:
            a = F.interpolate(acts[k][None, None], size=(H, W),
                              mode="bilinear", align_corners=False)[0, 0]
            lo, hi = a.min(), a.max()
            a = (a - lo) / (hi - lo) if hi > lo else a * 0
            masked.append(xi[0] * a)
        with torch.no_grad():
            sc = torch.softmax(model(torch.stack(masked)), 1)[:, cls].cpu().numpy()
        wts = sc - sc.min()
        an = acts.cpu().numpy()
        cam = np.tensordot(wts, an[top], axes=(0, 0))
        return _resize01(np.maximum(cam, 0), (H, W))

    def cleanup():
        if handle is not None:
            handle.remove()

    return preds, confs, cam_fn, cleanup


def _torch_target_layer(model):
    if hasattr(model, "features"):
        return model.features          # CNN adaptativa, EfficientNet, MobileNet
    if hasattr(model, "layer4"):
        return model.layer4            # ResNet
    return None


# ── Render (PIL, sin matplotlib) ─────────────────────────────────────────────────
def _resize01(a: np.ndarray, hw) -> np.ndarray:
    a = a.astype(np.float32)
    lo, hi = float(a.min()), float(a.max())
    a = (a - lo) / (hi - lo) if hi > lo else np.zeros_like(a)
    im = Image.fromarray((a * 255).astype(np.uint8)).resize((hw[1], hw[0]), Image.BILINEAR)
    return np.asarray(im, dtype=np.float32) / 255.0


def _to_rgb(img01: np.ndarray) -> np.ndarray:
    a = np.clip(img01, 0, 1)
    if a.ndim == 2:
        a = a[..., None]
    if a.shape[-1] == 1:
        a = np.repeat(a, 3, axis=-1)
    return (a[..., :3] * 255).astype(np.uint8)


def _jet(g: np.ndarray) -> np.ndarray:
    g = np.clip(g, 0, 1)
    r = np.clip(1.5 - np.abs(4 * g - 3), 0, 1)
    gr = np.clip(1.5 - np.abs(4 * g - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * g - 1), 0, 1)
    return (np.stack([r, gr, b], -1) * 255).astype(np.uint8)


def _overlay(rgb: np.ndarray, cam: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    heat = _jet(cam).astype(np.float32)
    return np.clip((1 - alpha) * rgb.astype(np.float32) + alpha * heat, 0, 255).astype(np.uint8)


def _name(class_names: Optional[list], idx: int) -> str:
    if class_names and 0 <= idx < len(class_names):
        return str(class_names[idx])
    return str(idx)


def _render(rows: list, output_dir: str) -> str:
    cell, pad, label_h = _CELL, 8, 18
    cols = 3
    titles = ["Original", "Score-CAM", "Overlay"]
    width = cols * cell + (cols + 1) * pad
    row_h = cell + label_h + pad
    height = len(rows) * row_h + pad + label_h
    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    for c, t in enumerate(titles):
        draw.text((pad + c * (cell + pad), 2), t, fill=(60, 60, 60))
    for r, row in enumerate(rows):
        y0 = label_h + pad + r * row_h
        color = (20, 120, 40) if row["ok"] else (200, 30, 30)
        tag = "OK" if row["ok"] else "ERR"
        draw.text((pad, y0), f"[{tag}] real={row['true']}  pred={row['pred']}  "
                            f"conf={row['conf']:.0%}", fill=color)
        for c, key in enumerate(("orig", "heat", "over")):
            im = Image.fromarray(row[key]).resize((cell, cell), Image.BILINEAR)
            canvas.paste(im, (pad + c * (cell + pad), y0 + label_h))
    path = os.path.join(output_dir, "scorecam_gallery.png")
    canvas.save(path)
    log.info("Score-CAM: galería guardada (%d muestras) → %s", len(rows), path)
    return path
