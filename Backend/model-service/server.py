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
import io
import os
import time
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from PIL import Image
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel

MODEL_PATH = os.environ.get("MODEL_PATH", "/model/artifact")
INPUT_SIZE = int(os.environ.get("INPUT_SIZE", "64"))
CHANNELS = int(os.environ.get("CHANNELS", "3"))
CLASS_NAMES: List[str] = [c for c in os.environ.get("CLASS_NAMES", "").split(",") if c]

app = FastAPI(title="SynapseOps Model Service", version="1.0.0")

# ── Métricas Prometheus (TEL-03) ──────────────────────────────────────────────
# Nombres alineados con el dashboard EN-012 / ADR-003 (job="model-service"):
#   http_request_duration_seconds (histograma) → P95 de inferencia (RN-002).
#   http_requests_total{status}                → throughput e índice de errores.
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds", "Latencia de las peticiones HTTP", ["endpoint"])
REQUEST_COUNT = Counter(
    "http_requests_total", "Total de peticiones HTTP", ["endpoint", "status"])


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
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# Estado del modelo cargado (se resuelve en el startup).
_state = {"model": None, "framework": None, "loaded": False}


def _detect_framework(path: str) -> str:
    lower = path.lower()
    if lower.endswith((".keras", ".h5")):
        return "tensorflow"
    if lower.endswith((".pt", ".pth")):
        return "pytorch"
    raise RuntimeError(f"Extensión de artefacto no soportada: {path}")


@app.on_event("startup")
def load_model() -> None:
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
    _state["loaded"] = True


class PredictRequest(BaseModel):
    image: Optional[str] = None  # imagen en base64 (data URL o b64 puro)


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


@app.post("/predict")
async def predict(body: Optional[PredictRequest] = None, file: Optional[UploadFile] = File(None)) -> dict:
    if not _state["loaded"]:
        raise HTTPException(status_code=503, detail="El modelo aún se está cargando.")

    raw: Optional[bytes] = None
    if file is not None:
        raw = await file.read()
    elif body is not None and body.image:
        b64 = body.image.split(",", 1)[-1]  # admite data URL "data:image/png;base64,...."
        try:
            raw = base64.b64decode(b64)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"Base64 inválido: {exc}")

    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Envía una imagen: JSON {\"image\": \"<base64>\"} o multipart con campo 'file'.",
        )

    try:
        arr = _preprocess(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"No se pudo procesar la imagen: {exc}")

    return _infer(arr)
