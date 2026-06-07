<div align="center">

<img src="Frontend/public/SynapseOpsLogo.png" width="130" alt="SynapseOps logo" />

# SynapseOps

**Low-Code MLOps Platform for Academic Environments**

[![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.0.6-6DB33F?style=flat-square&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-3.7-231F20?style=flat-square&logo=apachekafka&logoColor=white)](https://kafka.apache.org)
[![MLflow](https://img.shields.io/badge/MLflow-2.21.3-0194E2?style=flat-square&logo=mlflow&logoColor=white)](https://mlflow.org)
[![Docker](https://img.shields.io/badge/Docker_Compose-9_services-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

*Diseñado para UPAO — Ingeniería de Computación y Sistemas*

</div>

---

## ¿Qué es SynapseOps?

SynapseOps es una plataforma web **low-code basada en contenedores** que elimina la barrera operativa entre la investigación y la producción de modelos de deep learning en contextos académicos universitarios. Los estudiantes sin experiencia en infraestructura pueden ejecutar pipelines de entrenamiento, versionar modelos y monitorear métricas en tiempo real — todo desde un navegador, con un único comando de despliegue.

> **Gap que resuelve:** Kubeflow requiere Kubernetes (3+ nodos), MLflow standalone no tiene orquestación, Airflow asume infraestructura cloud. SynapseOps opera en un equipo con 8 GB RAM mediante `docker compose up -d`.

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Student Browser                                 │
│                    React 18 · React Flow · Tailwind                    │
└─────────────────────────┬──────────────────┬───────────────────────────┘
                    REST  │                  │  WebSocket
                          ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    backend-orchestrator :8080                           │
│         Spring Boot 4 / WebFlux · JWT/RBAC · Kafka Producer            │
│                    Docker Engine Client (DooD)                          │
└──────┬────────────────────────┬────────────────────────┬───────────────┘
       │                        │                        │
       ▼                        ▼                        ▼
┌─────────────┐    ┌────────────────────┐    ┌──────────────────────┐
│ postgres-db │    │   kafka-broker     │    │   mlflow-server      │
│  PostgreSQL │    │  KRaft · :9092     │    │   SQLite · :5000     │
│  17 · :5432 │    │  (sin ZooKeeper)   │    │   Model Registry     │
└─────────────┘    └────────┬───────────┘    └──────────────────────┘
                            │  job / result
                            ▼
              ┌─────────────────────────────┐
              │        ml-engine :8000      │
              │  FastAPI · Python 3.11      │
              │  TensorFlow / PyTorch       │
              │  Kafka Consumer + MLflow    │
              └─────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  Observability Stack                     │
│  cAdvisor → Prometheus :9090 → Grafana :3001            │
└──────────────────────────────────────────────────────────┘

                  model-service* :8500
              (FastAPI · despliegue dinámico)
```

---

## Stack Tecnológico

| Capa | Tecnología | Versión | Rol |
|------|-----------|---------|-----|
| **Frontend** | React + React Flow | 18.x | Canvas drag & drop + SPA |
| **Orquestador** | Spring Boot WebFlux | 4.0.6 | API reactiva, JWT, Kafka producer |
| **ML Engine** | FastAPI + Python | 3.11 | Entrenamiento TF/PyTorch, Kafka consumer |
| **Mensajería** | Apache Kafka KRaft | 3.7.0 | Desacoplamiento async sin ZooKeeper |
| **Tracking** | MLflow | 2.21.3 | Experiment tracking + Model Registry |
| **Base de Datos** | PostgreSQL | 17 | Persistencia de workspaces, pipelines, ejecuciones |
| **Migraciones** | Flyway | 10.x | Versionado de esquema V1–V4 |
| **Observabilidad** | Prometheus + Grafana | 2.51 / 10.4 | Métricas de contenedores y JVM |
| **Infra** | Docker Compose | 3.x | Single-node, 9 servicios, 8 GB RAM mínimo |

---

## Flujo Principal MLOps

```
 Estudiante                 Backend              Kafka         ML Engine          MLflow
     │                         │                   │               │                 │
     │  POST /workspaces        │                   │               │                 │
     │─────────────────────────▶│                   │               │                 │
     │  POST /dataset/url       │                   │               │                 │
     │  { kerasDataset: mnist } │                   │               │                 │
     │─────────────────────────▶│                   │               │                 │
     │  POST /pipelines         │                   │               │                 │
     │─────────────────────────▶│                   │               │                 │
     │  POST /execute           │                   │               │                 │
     │─────────────────────────▶│                   │               │                 │
     │  { status: RUNNING }     │  publish job      │               │                 │
     │◀─────────────────────────│──────────────────▶│               │                 │
     │                          │                   │  consume job  │                 │
     │                          │                   │──────────────▶│                 │
     │                          │                   │               │  train CNN      │
     │                          │                   │               │  accuracy=0.91  │
     │                          │                   │               │─────────────────▶
     │                          │                   │               │  register model │
     │                          │                   │               │  v6 registered  │
     │                          │                   │  publish result               │
     │                          │                   │◀──────────────│                 │
     │                          │  consume result   │               │                 │
     │                          │◀──────────────────│               │                 │
     │  GET /executions         │  status=COMPLETED │               │                 │
     │─────────────────────────▶│  mlflowRunId ✓    │               │                 │
     │  { COMPLETED, v6, 0.91 } │  artifact ✓       │               │                 │
     │◀─────────────────────────│  metrics ✓        │               │                 │
```

---

## Prerrequisitos

- **Docker Desktop** ≥ 4.x con Docker Compose v2
- **RAM** mínima: 8 GB (recomendado: 16 GB para entrenamiento)
- **CPU**: 4 núcleos mínimo
- **Almacenamiento**: 10 GB libres para imágenes y volúmenes

---

## Instalación y Despliegue

### 1. Clonar el repositorio

```bash
git clone https://github.com/Tunkifloo/SynapseOps-platform.git
cd SynapseOps
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```dotenv
# ── PostgreSQL ─────────────────────────────────────────────
DB_USERNAME=postgres
DB_PASSWORD=tu_password_seguro
POSTGRES_EXTERNAL_PORT=5432

# ── JWT ────────────────────────────────────────────────────
JWT_SECRET=genera_con_openssl_rand_hex_32
JWT_EXPIRATION=36000000

# ── Admin por defecto ──────────────────────────────────────
ADMIN_USERNAME=superadmin
ADMIN_PASSWORD=TuPasswordSeguro2026!
ADMIN_EMAIL=admin@synapseops.pe

# ── Kafka ──────────────────────────────────────────────────
KAFKA_CLUSTER_ID=synapseops-cluster-01

# ── Grafana ────────────────────────────────────────────────
GRAFANA_PASSWORD=grafana_password

# ── Storage ────────────────────────────────────────────────
STORAGE_MAX_FILE_SIZE_MB=500

# ── Perfil ─────────────────────────────────────────────────
SPRING_PROFILES_ACTIVE=prod
```

### 3. Levantar el stack completo

```bash
# Construir imágenes y levantar los 9 servicios
docker compose up -d --build

# Verificar que todos los servicios están healthy
docker compose ps
```

### 3.1. Despliegue CPU vs GPU (NVIDIA)

El `ml-engine` entrena en **CPU por defecto** y detecta GPU automáticamente
(`tf.config` / `torch.cuda`); si no hay GPU, hace *fallback* a CPU sin cambios.

**CPU (laboratorio estándar, default):**
```bash
docker compose up -d --build
# Imagen ml-engine ~5-7 GB (usa tensorflow-cpu; NO arrastra librerías CUDA).
```

**GPU (PC/labs con NVIDIA RTX):**
```bash
# Requisitos del host: driver NVIDIA + NVIDIA Container Toolkit.
#   - Linux: instalar nvidia-container-toolkit y reiniciar Docker.
#   - Windows: Docker Desktop con backend WSL2 + driver NVIDIA reciente
#     (la GPU se expone a los contenedores vía WSL2; sin pasos extra de toolkit).

# Construye la imagen GPU (TensorFlow[and-cuda] + PyTorch CUDA cu121) y levanta:
docker compose -f docker-compose.yml -f docker-compose.gpu.yml build ml-engine
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d

# Verifica en logs que usa la GPU:
docker compose logs ml-engine | grep -E "TF GPU|CUDA:"   # vs "Usando CPU"
```

> El override `docker-compose.gpu.yml` cambia el build-arg `REQUIREMENTS` a
> `requirements-gpu.txt` y reserva la GPU (`deploy.resources` + vars NVIDIA).
> ⚠️ La imagen GPU es grande (~varios GB extra por CUDA): asegura disco libre.

### 4. Verificar el despliegue

```bash
# Backend health check
curl http://localhost:8080/actuator/health

# ML Engine health check  
curl http://localhost:8000/health

# MLflow UI
open http://localhost:5000
```

---

## Servicios y Puertos

| Servicio | Puerto | URL | Descripción |
|---------|--------|-----|-------------|
| `frontend-app` | 3000 | http://localhost:3000 | Interfaz React |
| `backend-orchestrator` | 8080 | http://localhost:8080/api/v1 | API REST + Swagger |
| `ml-engine` | 8000 | http://localhost:8000 | FastAPI ML |
| `mlflow-server` | 5000 | http://localhost:5000 | MLflow UI |
| `grafana-dashboard` | 3001 | http://localhost:3001 | Dashboards |
| `prometheus-tsdb` | 9090 | http://localhost:9090 | Métricas |
| `postgres-db` | 5432 | — | Base de datos |
| `kafka-broker` | 9092/9094 | — | Mensajería |
| `cadvisor` | 8081 | http://localhost:8081 | Container metrics |

---

## Comandos Útiles

```bash
# Ver logs en tiempo real del backend
docker compose logs -f backend-orchestrator

# Ver logs del ciclo de entrenamiento
docker compose logs -f ml-engine

# Detener todos los servicios
docker compose down

# Detener y eliminar volúmenes (reset completo)
docker compose down -v

# Rebuild de un servicio específico
docker compose build --no-cache backend-orchestrator
docker compose up -d backend-orchestrator

# Entrar a la consola de PostgreSQL
docker exec -it postgres-db psql -U postgres -d orchestrator

# Ver consumer groups de Kafka
docker exec kafka-broker /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --list

# Consultar tópicos
docker exec kafka-broker /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --list
```

---

## Estructura del Monorepo

```
SynapseOps/
├── Backend/
│   ├── backend-orchestrator/          # Spring Boot 4 / WebFlux
│   │   ├── src/main/java/com/synapseops/orchestrator/
│   │   │   ├── config/               # Security, Kafka, CORS
│   │   │   ├── controller/           # REST endpoints
│   │   │   ├── domain/               # Entidades JPA + Repos
│   │   │   ├── infra/                # Kafka, MLflow, Docker facades
│   │   │   └── service/              # Lógica de negocio
│   │   ├── src/main/resources/
│   │   │   ├── application.yaml
│   │   │   ├── application-dev.yaml
│   │   │   ├── application-prod.yaml
│   │   │   └── db/migration/         # Flyway V1–V4
│   │   └── Dockerfile
│   │
│   └── ml-engine/                     # FastAPI + Python 3.11
│       ├── app/
│       │   ├── kafka/                # Consumer + Producer
│       │   ├── pipeline/             # Executor, Training strategies
│       │   │   ├── training/
│       │   │   │   ├── tensorflow_strategy.py
│       │   │   │   └── pytorch_strategy.py
│       │   │   └── executor.py
│       │   └── infra/
│       │       └── mlflow_client.py
│       ├── main.py
│       └── Dockerfile
│
├── Frontend/                          # React 18 + TypeScript
│   ├── src/
│   │   ├── app/router/               # React Router + guards
│   │   ├── features/                 # Workspaces, Executions, MLflow, Auth
│   │   ├── modules/                  # Pages por dominio
│   │   ├── shared/api/               # HTTP client + env
│   │   └── store/                    # Zustand global state
│   ├── nginx.conf                    # Proxy inverso → backend
│   └── Dockerfile                    # Multi-stage: Node build + nginx
│
├── infra/
│   ├── prometheus/prometheus.yml     # Scrape config
│   └── grafana/
│       ├── provisioning/             # Datasources
│       └── dashboards/               # JSON dashboards
│
├── docker-compose.yml                # Stack completo (9 servicios)
└── .env                              # Variables de entorno (no commitear)
```

---

## Architectural Decision Records (ADRs)

| ADR | Decisión | Justificación clave |
|-----|---------|---------------------|
| [ADR-001](docs/ADR001.pdf) | React + React Flow para el canvas | Drag & Drop nativo, nodos custom con estado visual en tiempo real |
| [ADR-002](docs/ADR002.pdf) | SSE para logs en tiempo real | Unidireccional, compatible con WebFlux sin overhead de WebSocket bidireccional |
| [ADR-003](docs/ADR003.pdf) | Prometheus + Grafana | Standard de facto para métricas de contenedores, integración nativa con Spring Actuator |
| [ADR-004](docs/ADR004.pdf) | Docker-outside-of-Docker (DooD) | Spring Boot controla el Docker Engine del host para despliegue dinámico de model-services |
| [ADR-005](docs/ADR005.pdf) | Patrones SOLID (Strategy, Builder, Observer, Facade) | `TensorFlowStrategy` / `PyTorchStrategy` intercambiables sin modificar el executor |
| [ADR-007](docs/ADR007.pdf) | MLflow como fuente única de verdad | API REST nativa permite a Spring Boot obtener `artifact_uri` programáticamente |
| [ADR-008](docs/ADR008.pdf) | Kafka KRaft (sin ZooKeeper) | Elimina dependencia de ZooKeeper, modo combinado broker+controller en un único contenedor |
| [ADR-009](docs/ADR009.pdf) | SnakeYAML + Mustache para IaC generado | Generación de `Dockerfile` y `docker-compose.yml` en runtime desde plantillas tipadas |
| [ADR-011](docs/ADR011.pdf) | Spring WebFlux reactivo | Non-blocking I/O para manejar concurrencia en pipelines de entrenamiento largos |

---

## Tópicos Kafka

| Tópico | Dirección | Descripción |
|--------|-----------|-------------|
| `mlops.pipeline.requests` | orchestrator → ml-engine | Job de entrenamiento con hiperparámetros |
| `mlops.pipeline.results` | ml-engine → orchestrator | Resultado con `run_id`, `model_version`, métricas |

**Payload de job:**
```json
{
  "executionId": "24",
  "workspaceId": "1",
  "framework": "tensorflow",
  "architecture": "cnn_adaptive",
  "epochs": 5,
  "batchSize": 64,
  "learningRate": 0.001,
  "numClasses": 10,
  "modelName": "mnist_cnn_demo",
  "datasetPath": "keras://mnist"
}
```

**Payload de resultado:**
```json
{
  "execution_id": "24",
  "status": "SUCCESS",
  "run_id": "3dfe36ec660343d9b6515b3d56ac1f3c",
  "model_version": "6",
  "artifact_path": "/storage/1/models/24/model.keras",
  "metrics": {
    "final_accuracy": 0.9120,
    "final_loss": 0.2929,
    "val_accuracy": 0.9337,
    "val_loss": 0.2143
  }
}
```

---

## Roles y Permisos

| Acción | COLLABORATOR | ADMIN |
|--------|:---:|:---:|
| Crear / gestionar workspaces propios | ✅ | ✅ |
| Subir datasets | ✅ | ✅ |
| Crear y ejecutar pipelines | ✅ | ✅ |
| Ver ejecuciones propias | ✅ | ✅ |
| Ver todos los usuarios | ❌ | ✅ |
| Activar / desactivar usuarios | ❌ | ✅ |
| Acceder al Model Registry (MLflow) | ❌ | ✅ |
| Ver todos los workspaces | ❌ | ✅ |

---

## Datasets Soportados

| Tipo | Método | Detalle |
|------|--------|---------|
| **Built-in (Keras)** | `keras://mnist`, `keras://fashion_mnist` | Cargados como numpy (sin TensorFlow), desde mirror HTTPS fiable. 28×28×1, 10 clases. |
| **URL** | `{ "url": "https://…/data.zip" }` | `.zip` de imágenes público. Servicio **blindado**: valida tipo de contenido, sigue redirecciones, detecta páginas HTML/login (p. ej. Kaggle), tope de tamaño y anti *zip-slip*. |
| **Subida ZIP** | `multipart/form-data` | `.zip` con imágenes; también `.png/.jpg/.jpeg` sueltas. |

**Autodetección de esquema** (datasets propios, ZIP/URL): el `ml-engine` reconoce
automáticamente dos *layouts* y **detecta nº de clases y `input_shape`**:
1. **Splits explícitos:** `train/<clase>/*` + `(val|validation)/<clase>/*` `[+ test/<clase>/*]`.
2. **Carpetas-clase planas:** `<clase>/*` → auto-split (ratio configurable en el nodo Split).

Guardrails de memoria (entorno 8 GB): ≤ 50 clases, ≤ 20 000 imágenes, ≥ 2 clases.

---

## Frameworks y CNN

| Framework | Arquitectura | Artefacto |
|-----------|--------------|-----------|
| **TensorFlow / Keras** | `cnn` (adaptativa) | `.keras` |
| **PyTorch** | `cnn` (adaptativa) | `.pt` |

Ambos frameworks comparten la **misma CNN adaptativa** y exponen las mismas
opciones (optimizador, BatchNorm, Early Stopping, Data Augmentation,
normalización). El `num_classes` y el `input_shape` se **autodetectan** del dataset.

---

## ML Engine y CNN Adaptativa (en detalle)

### Arquitectura del ML Engine (FastAPI + Kafka)

El `ml-engine` es un servicio FastAPI que consume trabajos de entrenamiento de
Kafka y los ejecuta con un **Template Method + Strategy**:

```
Kafka topic mlops.pipeline.requests
        │  (consumer daemon thread, procesamiento serial)
        ▼
PipelineExecutor.execute(job)        ← Template Method (pasos fijos)
   1. Ingesta      → ingestion.load_dataset(...)   (carga + normalización + split)
   2. Preprocess   → normalización {minmax|zscore|rescale} + (augmentation en train)
   3. Split        → train/val/test (explícito o auto por trainRatio)
   4. Entrenar     → TensorFlowStrategy | PyTorchStrategy   ← Strategy
   5. Métricas     → sklearn (precision/recall/f1/roc-auc) + matriz de confusión
   6. Registrar    → MLflow (params, métricas, artefacto, versión del modelo)
        │
        ├── Eventos por fase  →  Kafka mlops.pipeline.logs  →  SSE (consola en vivo)
        └── Resultado final   →  Kafka mlops.pipeline.results → orquestador (BD)
```

- **Selección de framework:** `_select_strategy(job.framework)` (factory) elige
  `TensorFlowStrategy` o `PyTorchStrategy`. El executor no conoce detalles del framework.
- **Streaming de logs:** cada fase y cada época emiten un evento (`LogProducer`,
  con *flush* inmediato) que el orquestador reenvía por SSE a la consola del lienzo.
- **Autodetección de hardware:** `tf.config` / `torch.cuda` → GPU si existe, si no CPU.

### La CNN adaptativa

Una única CNN que **se adapta al `input_shape` detectado** (no requiere que el
usuario defina capas):

- **Bloques convolucionales según resolución:**
  - Entrada pequeña (H ≤ 32, p. ej. 28×28 MNIST): **2 bloques** Conv→(BN)→ReLU→MaxPool con 32, 64 filtros.
  - Entrada mayor (H > 32, imágenes a color): **3 bloques** con 32, 64, 128 filtros.
- **Cabezal:** `GlobalAveragePooling → Dense(128, ReLU) → Dropout(0.4) → Dense(num_classes, softmax)`.
- **Adaptación de canales:** acepta 1 canal (escala de grises) o 3 (RGB) automáticamente.
- **`num_classes`** = autodetectado del dataset (la última capa se dimensiona sola).

### Opciones de entrenamiento (configurables por nodo)

| Opción | Nodo | Valores | Efecto |
|--------|------|---------|--------|
| **Optimizador** | Entrenamiento | `adam` · `adamw` · `sgd` (momentum) · `rmsprop` | Algoritmo de optimización. |
| **Batch Normalization** | Entrenamiento | on/off | Inserta `BatchNorm` tras cada conv (estabiliza/acelera). |
| **Early Stopping** | Entrenamiento | on/off + paciencia + monitor (`val_loss`/`val_accuracy`) | Detiene si no mejora; **restaura los mejores pesos**. |
| **Data Augmentation** | Preprocesamiento | on/off | TF: `RandomFlip/Rotation/Zoom`; PyTorch: flip aleatorio por lote. |
| **Normalización** | Preprocesamiento | `minmax [0,1]` · `zscore (media/σ)` · `rescale [-1,1]` | Escalado de píxeles. |
| **Tamaño de imagen** | Preprocesamiento | px (datasets propios) | *Resize* de entrada. |
| **% Train** | Split | 50–90 | Ratio del auto-split (datasets sin splits explícitos). |

### Métricas registradas (por modelo/versión)

- **Entrenamiento/validación:** `accuracy`/`loss` (train) y `val_accuracy`/`val_loss` (Keras por época).
- **Avanzadas (sklearn, sobre val y test):** `precision`, `recall`, `f1` (macro), `roc_auc` (OVR macro).
- **Matriz de confusión:** se registra como tag JSON y se renderiza interactiva en *Detalles del modelo*.

> El encabezado de cada versión prioriza **test → val → train accuracy** (métrica
> honesta de desempeño); el detalle muestra todos los hiperparámetros + métricas.

---

## Lienzo Low-Code (Sprint 2)

El módulo **Lienzo** es el centro operativo: se arrastran/tocan nodos
(Ingesta → Preprocesamiento → Split → Entrenamiento → Despliegue), se conectan en
orden y se ejecuta todo con **"Iniciar flujo"**:

- **Validación del grafo** antes de ejecutar: nodos presentes y **conectados en
  orden**, sin duplicados, todos configurados y con dataset asignado (mensajes claros).
- **Estados por nodo en vivo** (Idle → Running → Success/Error) mapeados a las
  fases reales que emite el ml-engine por SSE.
- **Consola de logs persistente** (siempre visible, desglosable; reanuda el
  historial al volver a la vista vía *replay* SSE).
- **Edición a prueba de errores:** borrador automático del lienzo, indicador de
  cambios sin guardar, aviso al salir y guardia por nodo.
- **Gestión de dataset** desde el **nodo Ingesta** (built-in / URL / ZIP) y de
  **pipelines** (crear/renombrar/eliminar) desde el propio Lienzo.

Módulos relacionados:
- **Espacios de trabajo:** CRUD de proyectos + listados detallados (pipelines,
  dataset, **historial de ejecuciones**).
- **Mis modelos:** registro de modelos del usuario (versiones, métricas, stage,
  *deploy handoff*, eliminar) con RBAC por workspace.

---

## API Reference

La documentación Swagger completa está disponible en:

```
http://localhost:8080/swagger-ui.html
```

Endpoints principales:

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout

GET    /api/v1/workspaces
POST   /api/v1/workspaces
PUT    /api/v1/workspaces/{id}
DELETE /api/v1/workspaces/{id}
POST   /api/v1/workspaces/{id}/dataset/url
POST   /api/v1/workspaces/{id}/dataset

GET    /api/v1/workspaces/{wId}/pipelines
POST   /api/v1/workspaces/{wId}/pipelines
PUT    /api/v1/workspaces/{wId}/pipelines/{pId}
DELETE /api/v1/workspaces/{wId}/pipelines/{pId}

POST   /api/v1/workspaces/{wId}/pipelines/{pId}/execute
GET    /api/v1/workspaces/{wId}/pipelines/{pId}/executions
GET    /api/v1/workspaces/{wId}/pipelines/{pId}/executions/{eId}

GET    /api/v1/workspaces/{wId}/pipelines/{pId}/canvas        # topología (HU-024)
PUT    /api/v1/workspaces/{wId}/pipelines/{pId}/canvas
GET    /api/v1/workspaces/{wId}/pipelines/{pId}/executions/{eId}/logs   # SSE (replay)

# Perfil propio
GET    /api/v1/users/me
PUT    /api/v1/users/me
PATCH  /api/v1/users/me/password

# Mis modelos (registro con alcance de workspace — RBAC DN-3)
GET    /api/v1/workspaces/{wId}/models
GET    /api/v1/workspaces/{wId}/models/{name}/versions
GET    /api/v1/workspaces/{wId}/models/{name}/versions/{v}/details   # params + métricas + matriz
DELETE /api/v1/workspaces/{wId}/models/{name}/versions/{v}
POST   /api/v1/workspaces/{wId}/models/{name}/versions/{v}/stage     # None|Staging|Production|Archived

GET    /api/v1/users
POST   /api/v1/users
PATCH  /api/v1/users/{id}            # body: {"enabled": bool} — activar/desactivar (idempotente)

# Consola global de MLflow (solo ADMIN, lectura de gobierno)
GET    /api/v1/mlflow/health
GET    /api/v1/mlflow/experiments
GET    /api/v1/mlflow/models
GET    /api/v1/mlflow/models/{name}/versions
GET    /api/v1/mlflow/runs/{runId}
```

> **`/execute`** acepta además (opcional): `optimizer`, `batchNorm`, `earlyStopping`,
> `esPatience`, `esMonitor`, `normalization`, `dataAugmentation`, `imageSize`,
> `trainRatio`. La gestión de escritura de modelos es **por workspace** (DN-3): el
> ADMIN es solo-lectura sobre lo ajeno; el dueño gestiona lo suyo.

---

## Roadmap

- [x] **Sprint 1** — Arquitectura base, backend-orchestrator, ml-engine, Kafka, MLflow, JWT/RBAC
- [x] **Sprint 2** — Lienzo Drag & Drop (5 nodos) + **Iniciar flujo** (validación de grafo, ejecución del flujo completo, estados por nodo), **logs SSE en vivo** (con replay/historial), CRUD de modelos versionados con RBAC (Mis modelos), módulo Espacios de trabajo + historial de ejecuciones, perfil de usuario, mejoras de CNN (optimizador, BatchNorm, Early Stopping, Data Augmentation, normalizaciones), métricas avanzadas (precision/recall/f1/roc-auc) + matriz de confusión, dataset blindado (URL/ZIP), build CPU/GPU, tests (JUnit + Vitest)
- [ ] **Sprint 3** — Despliegue dinámico de model-service (`/predict`), dashboards Grafana, pruebas de carga JMeter/K6, cuestionario SUS (32 estudiantes)

---

## Contribuidores

| Nombre | Rol | Contacto |
|--------|-----|---------|
| **Adrian Nicolás Cisneros Bartra** | Arquitecto · Full Stack · ML Engineer | UPAO — Ing. Computación y Sistemas |
| **Alfredo Rogger Guzman Moscol** | Full Stack · QA Engineer | UPAO — Ing. Computación y Sistemas |
| **Walter Cueva Chavez** | Asesor Técnico | UPAO |

---

## Contexto Académico

Este proyecto forma parte de la investigación:

> **"Impacto de una plataforma web low-code basada en contenedores para optimizar la eficiencia operativa y usabilidad en la gestión del ciclo de vida MLOps en proyectos académicos universitarios"**
>
> Universidad Privada Antenor Orrego (UPAO) — Trujillo, Perú · 2026

La validación empírica incluye la aplicación del cuestionario **SUS (System Usability Scale)** en una muestra de 32 proyectos estudiantiles, con análisis estadístico mediante IBM SPSS / Python SciPy.

---

## Licencia

```
MIT License — Copyright (c) 2026 Adrian Cisneros, Alfredo Guzman
```

---

<div align="center">

**SynapseOps** — *Democratizando MLOps en la academia*

`docker compose up -d` — Un comando. Nueve servicios. Ciclo MLOps completo.

</div>