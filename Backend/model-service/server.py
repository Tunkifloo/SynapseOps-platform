"""
SynapseOps · Plantilla del model-service (TA-007 · Sprint 3).

Servidor FastAPI mínimo que sirve un modelo entrenado por el pipeline para
inferencia. El backend-orchestrator (HU-007/HU-008) copia esta plantilla, inyecta
el artefacto y la parametriza por variables de entorno, y la levanta vía DooD.

Soporta TensorFlow (.keras/.h5) y PyTorch (.pt/.pth, idealmente TorchScript),
autodetectados por la extensión del artefacto.

Endpoints:
  GET  /health   → {status, model_loaded, framework}
  POST /predict  → acepta imagen como base64 (JSON {"image": "<b64>"}) o multipart
                   (campo `file`). Responde {prediction, confidence, class_name?}.

Variables de entorno (inyectadas por el orquestador):
  MODEL_PATH    Ruta del artefacto dentro del contenedor (obligatoria).
  INPUT_SIZE    Lado de la imagen cuadrada de entrada (default 64; debe coincidir
                con el tamaño con que se entrenó — IMG_SIZE del ml-engine).
  CHANNELS      Canales de entrada (default 3).
  CLASS_NAMES   Nombres de clase separados por coma (opcional, para etiquetar).
"""
import base64
import collections
import io
import json
import os
import time
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from PIL import Image
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

MODEL_PATH = os.environ.get("MODEL_PATH", "/model/artifact")
INPUT_SIZE = int(os.environ.get("INPUT_SIZE", "64"))
CHANNELS = int(os.environ.get("CHANNELS", "3"))
CLASS_NAMES: List[str] = [c for c in os.environ.get("CLASS_NAMES", "").split(",") if c]

# Drift de inferencia: la referencia (huella de features del train) la deja el ml-engine
# junto al artefacto del modelo. Se compara contra las imágenes que llegan a /predict.
REFERENCE_PATH = os.environ.get(
    "REFERENCE_PATH", os.path.join(os.path.dirname(MODEL_PATH), "train_reference.json"))
# Metadatos del modelo escritos por el ml-engine junto al artefacto. Tienen PRIORIDAD
# sobre INPUT_SIZE/CHANNELS/CLASS_NAMES del orquestador: imprescindible cuando el ml-engine
# forzó el tamaño internamente (p. ej. 224 en Transfer Learning) y el orquestador no lo sabe.
META_PATH = os.environ.get(
    "MODEL_META_PATH", os.path.join(os.path.dirname(MODEL_PATH), "model_meta.json"))
_DRIFT_BUFFER_SIZE = 500     # imágenes recientes de /predict a retener
_MIN_DRIFT_SAMPLES = 30      # mínimo para calcular drift con sentido
_PSI_SIGNIFICANT = 0.25

app = FastAPI(title="SynapseOps Model Service", version="1.0.0")

# ── Métricas Prometheus (TEL-03) ──────────────────────────────────────────────
# Nombres alineados con el dashboard EN-012 / ADR-003 (job="model-service"):
#   http_request_duration_seconds (histograma) → P95 de inferencia (RN-002).
#   http_requests_total{status}                → throughput e índice de errores.
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds", "Latencia de las peticiones HTTP", ["endpoint"])
REQUEST_COUNT = Counter(
    "http_requests_total", "Total de peticiones HTTP", ["endpoint", "status"])
# Drift de inferencia: PSI máximo entre las imágenes de /predict y el train, y nº de muestras.
INFERENCE_DRIFT_PSI = Gauge(
    "inference_drift_psi", "PSI máx. de las features de /predict vs entrenamiento")
INFERENCE_DRIFT_SHARE = Gauge(
    "inference_drift_share", "Fracción de features con deriva (PSI≥0.25) en inferencia")
INFERENCE_SAMPLES = Gauge(
    "inference_samples", "Imágenes de /predict acumuladas para el cálculo de drift")

# Buffer de features de las últimas imágenes servidas.
_pred_buffer: "collections.deque" = collections.deque(maxlen=_DRIFT_BUFFER_SIZE)


@app.middleware("http")
async def _metrics_middleware(request: Request, call_next):
    if request.url.path == "/metrics":
        return await call_next(request)
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    endpoint = request.url.path
    REQUEST_LATENCY.labels(endpoint=endpoint).observe(elapsed)
    REQUEST_COUNT.labels(endpoint=endpoint, status=str(response.status_code)).inc()
    return response


@app.get("/metrics")
def metrics() -> Response:
    """Exposición Prometheus (scrapeada vía docker_sd, HU-009)."""
    _refresh_drift_gauges()
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# Estado del modelo cargado (se resuelve en el startup).
_state = {"model": None, "framework": None, "loaded": False, "ref_feats": None}


def _detect_framework(path: str) -> str:
    lower = path.lower()
    if lower.endswith((".keras", ".h5")):
        return "tensorflow"
    if lower.endswith((".pt", ".pth")):
        return "pytorch"
    raise RuntimeError(f"Extensión de artefacto no soportada: {path}")


def _apply_model_meta() -> None:
    """Ajusta INPUT_SIZE/CHANNELS/CLASS_NAMES desde model_meta.json si existe."""
    global INPUT_SIZE, CHANNELS, CLASS_NAMES
    try:
        if not os.path.exists(META_PATH):
            return
        with open(META_PATH, "r", encoding="utf-8") as f:
            meta = json.load(f)
        if meta.get("input_size"):
            INPUT_SIZE = int(meta["input_size"])
        if meta.get("channels"):
            CHANNELS = int(meta["channels"])
        if meta.get("class_names"):
            CLASS_NAMES = list(meta["class_names"])
        print(f"[model-service] meta aplicada: input_size={INPUT_SIZE} channels={CHANNELS} "
              f"classes={len(CLASS_NAMES)}", flush=True)
    except Exception as exc:  # noqa: BLE001 — metadato no crítico
        print(f"[model-service] no se pudo leer model_meta.json: {exc}", flush=True)


@app.on_event("startup")
def load_model() -> None:
    _apply_model_meta()
    framework = _detect_framework(MODEL_PATH)
    _state["framework"] = framework
    if framework == "tensorflow":
        import tensorflow as tf  # noqa: import diferido (imagen TF)
        _state["model"] = tf.keras.models.load_model(MODEL_PATH)
    else:
        import torch  # noqa: import diferido (imagen Torch)
        # Preferimos TorchScript (no requiere la clase del modelo); fallback a torch.load.
        try:
            model = torch.jit.load(MODEL_PATH, map_location="cpu")
        except Exception:
            model = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
        model.eval()
        _state["model"] = model
    _state["ref_feats"] = _load_reference()
    _state["loaded"] = True


# ── Drift de inferencia (features compactas + PSI) ────────────────────────────
def _image_features(arr: np.ndarray) -> np.ndarray:
    """Una imagen (H,W,C) en [0,1] → 8 features (media/σ por canal RGB, brillo, contraste)."""
    a = arr if arr.ndim == 3 else arr[..., np.newaxis]
    mean_c, std_c = a.mean(axis=(0, 1)), a.std(axis=(0, 1))
    if a.shape[2] == 1:
        mean_c, std_c = np.repeat(mean_c, 3), np.repeat(std_c, 3)
    else:
        mean_c, std_c = mean_c[:3], std_c[:3]
    return np.array([*mean_c, *std_c, float(a.mean()), float(a.std())], dtype=np.float32)


def _psi(ref: np.ndarray, cur: np.ndarray, bins: int = 10) -> float:
    ref, cur = ref[np.isfinite(ref)], cur[np.isfinite(cur)]
    if ref.size == 0 or cur.size == 0:
        return 0.0
    edges = np.quantile(ref, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf
    if len(np.unique(edges)) < 3:
        return 0.0
    rp = np.clip(np.histogram(ref, bins=edges)[0] / len(ref), 1e-6, None)
    cp = np.clip(np.histogram(cur, bins=edges)[0] / len(cur), 1e-6, None)
    return float(np.sum((cp - rp) * np.log(cp / rp)))


def _load_reference() -> Optional[np.ndarray]:
    try:
        if not os.path.exists(REFERENCE_PATH):
            return None
        with open(REFERENCE_PATH, "r", encoding="utf-8") as f:
            feats = np.asarray(json.load(f).get("features", []), dtype=np.float32)
        return feats if feats.size else None
    except Exception:  # noqa: BLE001
        return None


def _compute_inference_drift() -> Optional[dict]:
    ref = _state.get("ref_feats")
    n = len(_pred_buffer)
    if ref is None or n < _MIN_DRIFT_SAMPLES:
        return None
    cur = np.asarray(_pred_buffer, dtype=np.float32)
    psis = np.array([_psi(ref[:, i], cur[:, i]) for i in range(ref.shape[1])])
    share = float(int((psis >= _PSI_SIGNIFICANT).sum()) / len(psis))
    max_psi = float(psis.max())
    sev = "none" if max_psi < 0.10 else ("moderate" if max_psi < _PSI_SIGNIFICANT else "significant")
    return {"samples": n, "drifted": bool(max_psi >= _PSI_SIGNIFICANT or share >= 0.30),
            "severity": sev, "max_psi": round(max_psi, 4), "share_drifted": round(share, 4)}


def _refresh_drift_gauges() -> None:
    INFERENCE_SAMPLES.set(len(_pred_buffer))
    d = _compute_inference_drift()
    if d is not None:
        INFERENCE_DRIFT_PSI.set(d["max_psi"])
        INFERENCE_DRIFT_SHARE.set(d["share_drifted"])


def _preprocess(raw: bytes) -> np.ndarray:
    """Bytes de imagen → tensor float32 [0,1] de tamaño (INPUT_SIZE, INPUT_SIZE, C)."""
    mode = "RGB" if CHANNELS == 3 else "L"
    img = Image.open(io.BytesIO(raw)).convert(mode).resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    if CHANNELS == 1:
        arr = arr[..., np.newaxis]
    return arr


def _infer(arr: np.ndarray) -> dict:
    framework = _state["framework"]
    model = _state["model"]
    if framework == "tensorflow":
        batch = arr[np.newaxis, ...]  # NHWC
        probs = np.asarray(model.predict(batch, verbose=0))[0]
    else:
        import torch
        # PyTorch espera NCHW.
        chw = np.transpose(arr, (2, 0, 1))
        tensor = torch.from_numpy(chw[np.newaxis, ...]).float()
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
    idx = int(np.argmax(probs))
    confidence = float(probs[idx])
    result = {"prediction": idx, "confidence": round(confidence, 4)}
    if 0 <= idx < len(CLASS_NAMES):
        result["class_name"] = CLASS_NAMES[idx]
    return result


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if _state["loaded"] else "loading",
        "model_loaded": _state["loaded"],
        "framework": _state["framework"],
    }


def _b64_to_bytes(b64: str) -> bytes:
    """Decodifica base64 (admite data URL 'data:image/png;base64,....')."""
    try:
        return base64.b64decode(b64.split(",", 1)[-1])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Base64 inválido: {exc}")


@app.post("/predict")
async def predict(request: Request) -> dict:
    # IMPORTANTE: se parsea el body manualmente según el Content-Type. NO se mezcla un
    # modelo Pydantic (JSON) con File()/UploadFile en la firma: FastAPI fuerza entonces
    # multipart/form-data para TODO el endpoint y un POST JSON deja el body vacío
    # (→ 400 "Envía una imagen" aunque sí venía la imagen). El orquestador envía JSON.
    if not _state["loaded"]:
        raise HTTPException(status_code=503, detail="El modelo aún se está cargando.")

    raw: Optional[bytes] = None
    ctype = request.headers.get("content-type", "").lower()

    if "multipart/form-data" in ctype:
        form = await request.form()
        upload = form.get("file")
        if upload is not None and hasattr(upload, "read"):
            raw = await upload.read()
    else:
        # JSON {"image": "<base64>"} (default; también si el Content-Type falta).
        try:
            data = await request.json()
        except Exception:  # noqa: BLE001
            data = None
        b64 = (data or {}).get("image") if isinstance(data, dict) else None
        if b64:
            raw = _b64_to_bytes(b64)

    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Envía una imagen: JSON {\"image\": \"<base64>\"} o multipart con campo 'file'.",
        )

    try:
        arr = _preprocess(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"No se pudo procesar la imagen: {exc}")

    result = _infer(arr)
    # Acumula la huella de la imagen para el drift de inferencia (no bloquea la respuesta).
    try:
        _pred_buffer.append(_image_features(arr))
    except Exception:  # noqa: BLE001
        pass
    return result


@app.get("/drift")
def drift() -> dict:
    """Drift de inferencia: distribución de las imágenes de /predict vs el entrenamiento."""
    if _state.get("ref_feats") is None:
        return {"available": False, "reason": "sin referencia de entrenamiento"}
    d = _compute_inference_drift()
    if d is None:
        return {"available": False, "reason": f"insuficientes muestras (<{_MIN_DRIFT_SAMPLES})",
                "samples": len(_pred_buffer)}
    return {"available": True, **d}
