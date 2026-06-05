<div align="center">

```
███████╗██╗   ██╗███╗   ██╗ █████╗ ██████╗ ███████╗███████╗ ██████╗ ██████╗ ███████╗
██╔════╝╚██╗ ██╔╝████╗  ██║██╔══██╗██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝
███████╗ ╚████╔╝ ██╔██╗ ██║███████║██████╔╝███████╗█████╗  ██║   ██║██████╔╝███████╗
╚════██║  ╚██╔╝  ██║╚██╗██║██╔══██║██╔═══╝ ╚════██║██╔══╝  ██║   ██║██╔═══╝ ╚════██║
███████║   ██║   ██║ ╚████║██║  ██║██║     ███████║███████╗╚██████╔╝██║     ███████║
╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝     ╚══════╝╚══════╝ ╚═════╝ ╚═╝     ╚══════╝
```

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
git clone https://github.com/tu-usuario/SynapseOps.git
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

| Tipo | Método | Ejemplo |
|------|--------|---------|
| **Keras Built-in** | `{ "kerasDataset": "mnist" }` | MNIST, Fashion MNIST, CIFAR-10, CIFAR-100 |
| **HTTP URL** | `{ "url": "https://..." }` | Archivo `.zip` de imágenes |
| **File Upload** | `multipart/form-data` | `.zip`, `.png`, `.jpg`, `.jpeg` |

---

## Frameworks de Entrenamiento

| Framework | Arquitecturas disponibles | Formato de artefacto |
|-----------|--------------------------|---------------------|
| **TensorFlow / Keras** | `cnn`, `cnn_adaptive`, `resnet_mini` | `.keras` |
| **PyTorch** | `cnn`, `resnet_mini` | `.pt` |

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

GET    /api/v1/users
POST   /api/v1/users
PATCH  /api/v1/users/{id}            # body: {"enabled": bool} — activar/desactivar (idempotente)

GET    /api/v1/mlflow/health
GET    /api/v1/mlflow/experiments
GET    /api/v1/mlflow/models
GET    /api/v1/mlflow/models/{name}/versions
GET    /api/v1/mlflow/runs/{runId}
GET    /api/v1/mlflow/runs/{runId}/metrics
```

---

## Roadmap

- [x] **Sprint 1** — Arquitectura base, backend-orchestrator, ml-engine, Kafka, MLflow, JWT/RBAC
- [ ] **Sprint 2** — Canvas Drag & Drop (React Flow 5 nodos), WebSocket logs en tiempo real, UI completa
- [ ] **Sprint 3** — Despliegue dinámico de model-service, dashboards Grafana, pruebas de carga JMeter/K6, cuestionario SUS (32 estudiantes)

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