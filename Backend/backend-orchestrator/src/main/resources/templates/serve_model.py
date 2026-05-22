"""
SynapseOps — model-service
Servidor de inferencia generado dinámicamente por DockerfileBuilder.
Carga el modelo .keras desde ARTIFACT_PATH y expone POST /predict.
"""
import os
import io
import logging
import numpy as np
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
import base64

log = logging.getLogger("model-service")
logging.basicConfig(level="INFO")

app = FastAPI(title="SynapseOps Model Service", version="1.0.0")

# ── Cargar modelo al inicio ───────────────────────────────────────────────────
ARTIFACT_PATH   = os.getenv("ARTIFACT_PATH", "/app/model.keras")
MODEL_NAME      = os.getenv("MODEL_NAME", "model")
IMG_SIZE        = (64, 64)   # mismo tamaño usado en entrenamiento

model = None

@app.on_event("startup")
def load_model():
    global model
    import tensorflow as tf
    model_path = Path(ARTIFACT_PATH)
    if not model_path.exists():
        log.error("Modelo no encontrado en: %s", ARTIFACT_PATH)
        raise RuntimeError(f"Modelo no encontrado: {ARTIFACT_PATH}")
    model = tf.keras.models.load_model(str(model_path))
    log.info("Modelo cargado desde: %s", ARTIFACT_PATH)


# ── DTOs ──────────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    image_base64: str          # imagen codificada en base64
    top_k: int = 3             # top-K predicciones a retornar


class PredictResponse(BaseModel):
    predictions: list[dict]    # [{"class_index": int, "confidence": float}]
    model_name: str


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "loaded": model is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Modelo no disponible.")
    try:
        import tensorflow as tf
        # Decodificar imagen base64
        img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img = img.resize(IMG_SIZE)
        x = np.array(img, dtype=np.float32) / 255.0
        x = np.expand_dims(x, axis=0)

        preds = model.predict(x, verbose=0)[0]

        top_k = min(request.top_k, len(preds))
        top_indices = np.argsort(preds)[::-1][:top_k]

        return PredictResponse(
            predictions=[
                {"class_index": int(i), "confidence": float(preds[i])}
                for i in top_indices
            ],
            model_name=MODEL_NAME,
        )
    except Exception as e:
        log.exception("Error en predicción: %s", e)
        raise HTTPException(status_code=500, detail=str(e))