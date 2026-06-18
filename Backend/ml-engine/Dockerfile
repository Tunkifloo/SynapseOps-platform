# syntax=docker/dockerfile:1
# IMPORTANTE: este Dockerfile usa cache mounts de BuildKit (`--mount=type=cache`). Docker
# Compose v2 y `docker buildx` activan BuildKit por defecto. Si construyes con un Docker
# antiguo, exporta DOCKER_BUILDKIT=1 — si no, los `--mount=cache` se ignoran y pip
# re-descarga TODO en cada build.
FROM python:3.11-slim

LABEL org.opencontainers.image.title="ml-engine"
LABEL org.opencontainers.image.description="SynapseOps ML Engine — FastAPI + TF/PyTorch"

# Dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Usuario no-root + volumen de storage (antes del USER → chown como root).
RUN useradd -m -s /bin/bash mlengine \
    && mkdir -p /storage && chown mlengine:mlengine /storage

WORKDIR /app

# ── Dependencias Python en DOS capas para maximizar el cacheo ─────────────────────
# El dolor que esto resuelve: con un único `pip install -r requirements.txt`, cambiar
# CUALQUIER dependencia (o cambiar de CPU↔GPU) invalidaba la capa y re-instalaba/
# re-descargaba TensorFlow + PyTorch (varios GB) una y otra vez.
#
#   Capa 1 (pesada/estable): frameworks ML (TF/Torch). Solo se reinstala si cambian sus
#                            pins. La selecciona FRAMEWORKS:
#                              CPU (default): requirements-frameworks.txt
#                              GPU/CUDA:      --build-arg FRAMEWORKS=requirements-frameworks-gpu.txt
#   Capa 2 (ligera/volátil): deps de app (FastAPI, MLflow, numpy…). Cambiar una de estas
#                            NO toca la capa de frameworks → no re-descarga TF/Torch.
#
# El cache mount de BuildKit guarda las ruedas descargadas FUERA de la imagen (caché
# persistente del builder, mismo `id` en ambos pasos). En rebuilds: de "una eternidad"
# a segundos. La imagen final no crece. Sin `--no-cache-dir` para poblar la caché.
ARG FRAMEWORKS=requirements-frameworks.txt

COPY ${FRAMEWORKS} ./requirements-frameworks.txt
RUN --mount=type=cache,target=/root/.cache/pip,id=mlengine-pip,sharing=locked \
    pip install --upgrade pip && \
    pip install -r requirements-frameworks.txt

COPY requirements-core.txt ./requirements-core.txt
RUN --mount=type=cache,target=/root/.cache/pip,id=mlengine-pip,sharing=locked \
    pip install -r requirements-core.txt

# Pre-cacheo de pesos ImageNet (Transfer Learning) para entrenar OFFLINE en los labs.
# Va ANTES de copiar el código fuente y depende SOLO de (frameworks + core + el script)
# → al cambiar el código NO se re-ejecuta. Corre como `mlengine` → el cache (~/.keras,
# ~/.cache/torch) coincide con el usuario de runtime. Desactivado por defecto (imagen CPU
# del CI queda ligera); la imagen GPU lo activa con:
#   docker build --build-arg PRECACHE_WEIGHTS=true …  (ver docker-compose.gpu.yml)
COPY --chown=mlengine:mlengine scripts ./scripts
USER mlengine
ARG PRECACHE_WEIGHTS=false
RUN if [ "$PRECACHE_WEIGHTS" = "true" ]; then python scripts/precache_weights.py; fi

# Código fuente (los cambios aquí NO invalidan el pip install ni el pre-cache de arriba).
COPY --chown=mlengine:mlengine . .

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -sf http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
