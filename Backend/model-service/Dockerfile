# Plantilla de imagen del model-service (TA-007). El orquestador (HU-007) elige
# FRAMEWORK según la extensión del artefacto: `tf` (.keras/.h5) o `torch` (.pt/.pth).
#   docker build --build-arg FRAMEWORK=tf    -t modelo_<ws> .
#   docker build --build-arg FRAMEWORK=torch -t modelo_<ws> .
FROM python:3.11-slim

ARG FRAMEWORK=tf
WORKDIR /app

# Dependencias base (servidor + procesamiento de imagen).
COPY requirements-base.txt ./
RUN pip install --no-cache-dir -r requirements-base.txt

# Framework de inferencia según el tipo de artefacto.
COPY requirements-${FRAMEWORK}.txt ./fw-requirements.txt
RUN pip install --no-cache-dir -r fw-requirements.txt

COPY server.py ./

# El artefacto se inyecta por el orquestador (COPY del .keras/.pt al construir,
# o montaje del volumen /storage). Parámetros por defecto (sobre-escribibles).
ENV MODEL_PATH=/model/artifact \
    INPUT_SIZE=64 \
    CHANNELS=3

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
