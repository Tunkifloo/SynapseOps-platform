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

# Instalar dependencias Python primero (capa cacheada)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Código fuente
COPY --chown=mlengine:mlengine . .

RUN mkdir -p /storage && chown mlengine:mlengine /storage

USER mlengine

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -sf http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]