# syntax=docker/dockerfile:1
FROM python:3.11-slim

LABEL org.opencontainers.image.title="ml-engine"
LABEL org.opencontainers.image.description="SynapseOps ML Engine — FastAPI + TF/PyTorch"

# Dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Usuario no-root
RUN useradd -m -s /bin/bash mlengine

WORKDIR /app

# Instalar dependencias Python primero (capa cacheada).
# REQUIREMENTS selecciona CPU (default) o GPU/CUDA:
#   CPU: (default) requirements.txt
#   GPU: docker build --build-arg REQUIREMENTS=requirements-gpu.txt
ARG REQUIREMENTS=requirements.txt
COPY ${REQUIREMENTS} ./requirements.txt
# Cache mount de BuildKit: las ruedas descargadas (TF/Torch/CUDA, varios GB) se
# guardan en una caché persistente FUERA de la imagen. En rebuilds NO se vuelven
# a descargar → de "una eternidad" a minutos. La imagen final no crece (la caché
# vive en el builder, no en una capa). Sin `--no-cache-dir` para poblar la caché.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install -r requirements.txt

# Código fuente
COPY --chown=mlengine:mlengine . .

RUN mkdir -p /storage && chown mlengine:mlengine /storage

USER mlengine

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -sf http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]