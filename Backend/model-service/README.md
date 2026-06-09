# Plantilla model-service (TA-007 · Sprint 3)

Servidor FastAPI mínimo que el orquestador **copia y parametriza** dinámicamente
para servir un modelo entrenado (HU-007 genera el Dockerfile/compose, HU-008 lo
levanta vía DooD). **No editar para un modelo concreto** — es la plantilla base.

## Endpoints
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/health`  | `{status, model_loaded, framework}` (usado por el health check, TA-001). |
| `POST` | `/predict` | Imagen como **base64** (`{"image":"<b64>"}`, admite data-URL) **o** **multipart** (campo `file`). Responde `{prediction, confidence, class_name?}`. |

## Frameworks soportados (autodetectados por extensión)
- **TensorFlow** → `.keras` / `.h5` (`tf.keras.models.load_model`).
- **PyTorch** → `.pt` / `.pth`. Se intenta **TorchScript** (`torch.jit.load`, no requiere el código de la clase) y, si falla, `torch.load`.

> ⚠️ **PyTorch:** para que el model-service cargue sin el código fuente del modelo,
> el ml-engine debería registrar los modelos PyTorch como **TorchScript**
> (`torch.jit.script(model).save(...)`). Pendiente de ajustar en `PyTorchStrategy`.

## Variables de entorno (inyectadas por el orquestador)
| Var | Default | Descripción |
|-----|---------|-------------|
| `MODEL_PATH` | `/model/artifact` | Ruta del artefacto dentro del contenedor. |
| `INPUT_SIZE` | `64` | Lado de la imagen cuadrada (debe coincidir con `IMG_SIZE` del entrenamiento). |
| `CHANNELS` | `3` | Canales de entrada (1 = escala de grises). |
| `CLASS_NAMES` | — | Nombres de clase separados por coma (para etiquetar la predicción). |

## Build (lo hace HU-007 según el artefacto)
```bash
docker build --build-arg FRAMEWORK=tf    -t modelo_<workspaceId> .   # .keras/.h5
docker build --build-arg FRAMEWORK=torch -t modelo_<workspaceId> .   # .pt/.pth
```

## Prueba local rápida
```bash
# (con un artefacto montado en /model/artifact)
curl -F "file=@gato.jpg" http://localhost:8001/predict
curl -X POST http://localhost:8001/predict -H "Content-Type: application/json" \
     -d "{\"image\":\"$(base64 -w0 gato.jpg)\"}"
```
