<div align="center">

<img src="https://github.com/Tunkifloo/SynapseOps-platform/blob/847b979ceca5c1dcfdf6a68d3a6e761ca3ff09be/frontend/src/assets/synapseops-logo.png" width="130" alt="SynapseOps logo" />

# SynapseOps

**Plataforma MLOps Low-Code basada en contenedores**

*Del dataset al endpoint de inferencia — sin tocar infraestructura, desde el navegador.*

[![Spring Boot](https://img.shields.io/badge/Spring_Boot-4.0.6-6DB33F?style=flat-square&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.11-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18_+_TS-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-3.7_KRaft-231F20?style=flat-square&logo=apachekafka&logoColor=white)](https://kafka.apache.org)
[![MLflow](https://img.shields.io/badge/MLflow-2.21.3-0194E2?style=flat-square&logo=mlflow&logoColor=white)](https://mlflow.org)
[![Prometheus](https://img.shields.io/badge/Prometheus_+_Grafana-Observability-E6522C?style=flat-square&logo=prometheus&logoColor=white)](https://prometheus.io)
[![Docker](https://img.shields.io/badge/Docker_Compose-9_servicios-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## ¿Qué es SynapseOps?

SynapseOps es una **plataforma web low-code basada en contenedores** que cubre el **ciclo de vida MLOps completo** — ingesta de datos → preprocesamiento → entrenamiento → versionado → **despliegue dinámico** → **inferencia** → **monitoreo y detección de deriva** — desde un navegador y con un único comando de arranque.

El objetivo: que cualquier persona pueda entrenar, versionar, **desplegar** y **monitorear** modelos de visión por computador **sin escribir infraestructura** ni conocer Docker, Kafka o Kubernetes.

> **El gap que resuelve:** Kubeflow exige un clúster Kubernetes; MLflow por sí solo no orquesta ni despliega; Airflow asume infraestructura cloud. SynapseOps corre **todo el ciclo MLOps** en un equipo con **8 GB de RAM** mediante `docker compose up -d`.

---

## ✨ Características

- 🎨 **Lienzo low-code (drag & drop):** arma el pipeline conectando nodos *Ingesta → Preprocesamiento → Split → Entrenamiento → Despliegue* y ejecútalo con un clic.
- 🧠 **CNN adaptativa + Transfer Learning (TensorFlow o PyTorch):** entrena desde cero (CNN que se adapta al `input_shape` y nº de clases) **o** usa backbones preentrenados en ImageNet — **EfficientNetB0, MobileNetV2, ResNet50** — con flujo de **2 fases (Feature Extraction → Fine-Tuning)**.
- 🧪 **Preprocesamiento avanzado:** catálogo granular de **Data Augmentation (10 técnicas selectivas)**, **balanceo de clases** (oversample/undersample/hybrid), normalización configurable y regularización (**Dropout, L2**).
- 🔍 **Interpretabilidad (Score-CAM):** galería de mapas de calor que muestra en qué regiones se fija el modelo (acierto/error), como artefacto en MLflow y en el detalle del modelo.
- 🚀 **Despliegue dinámico de inferencia:** al terminar el flujo, SynapseOps **genera, construye y levanta un `model-service`** (FastAPI) con endpoint `/predict`, puerto dinámico y health-check automático.
- 📊 **Telemetría de ciclo de vida (Process Tracker):** tiempo de re-entrenamiento, lead time de despliegue, cold start, tasa de éxito y esfuerzo de interacción — por proyecto y por modelo.
- 🛡️ **Calidad y Data Drift:** detección de overfitting + **deriva de datos** (Evidently AI + PSI) entre splits, entre corridas de re-entrenamiento y en **inferencia**.
- 📈 **Observabilidad completa:** cAdvisor → Prometheus → Grafana, con métricas de inferencia (latencia P95, throughput) del model-service.
- 🔐 **Multiusuario con RBAC:** roles ADMIN / COLLABORATOR, JWT, gestión de usuarios y analítica global de plataforma.
- 🧩 **Un comando:** `docker compose up -d` levanta 9 servicios; el model-service se crea bajo demanda.

---

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Navegador del usuario                              │
│        React 18 · TypeScript · React Flow · Tailwind · shadcn/ui          │
└──────────────────────────────┬──────────────────────┬─────────────────────┘
                          REST  │                      │  SSE (logs en vivo)
                                ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       backend-orchestrator :8080                           │
│     Spring Boot 4 / WebFlux · JWT/RBAC · Kafka Producer · Flyway           │
│            Docker Engine Client (DooD)  →  crea model-services             │
└──────┬───────────────┬──────────────────┬──────────────────┬──────────────┘
       ▼               ▼                  ▼                  ▼
┌────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────┐
│ postgres-db│  │ kafka-broker │  │ mlflow-server │  │  model-service*     │
│ PostgreSQL │  │ KRaft :9092  │  │  :5000        │  │  FastAPI · :800x     │
│ 17 · :5432 │  │ (sin ZK)     │  │ Model Registry│  │  /predict /metrics   │
└────────────┘  └──────┬───────┘  └───────────────┘  │  (creado en runtime) │
                       │ job / result / logs          └─────────────────────┘
                       ▼
            ┌──────────────────────────┐      ┌──────────────────────────────┐
            │       ml-engine :8000    │      │   Stack de Observabilidad     │
            │  FastAPI · Python 3.11   │      │  cAdvisor :8081 → Prometheus  │
            │  TensorFlow / PyTorch    │      │  :9090 → Grafana :3001        │
            │  Kafka Consumer + MLflow │      │  (+ métricas del model-service)│
            │  Evidently (data drift)  │      └──────────────────────────────┘
            └──────────────────────────┘

   * El model-service NO está en docker-compose: el orquestador genera su
     Dockerfile/compose, construye la imagen y lo levanta vía DooD al desplegar.
```

---

## Stack Tecnológico

| Capa | Tecnología | Versión | Rol |
|------|-----------|---------|-----|
| **Frontend** | React + TypeScript + React Flow | 18 | Lienzo drag & drop + SPA + dashboards |
| **UI** | Tailwind CSS + shadcn/ui + Zustand | 4 | Diseño + estado global |
| **Orquestador** | Spring Boot WebFlux | 4.0.6 | API reactiva, JWT, Kafka, DooD, telemetría |
| **ML Engine** | FastAPI + Python | 3.11 | Entrenamiento TF/PyTorch, ingesta, drift |
| **Model Service** | FastAPI (plantilla generada) | — | Inferencia `/predict` + `/metrics` (dinámico) |
| **Mensajería** | Apache Kafka (KRaft) | 3.7.0 | Async sin ZooKeeper |
| **Tracking** | MLflow | 2.21.3 | Experiment tracking + Model Registry |
| **Drift** | Evidently AI + PSI | — | Detección de deriva de datos |
| **Base de Datos** | PostgreSQL | 17 | Workspaces, pipelines, ejecuciones, telemetría |
| **Migraciones** | Flyway | V1–V11 | Versionado de esquema reproducible |
| **Observabilidad** | cAdvisor + Prometheus + Grafana | 2.51 / 10.4 | Métricas de contenedores e inferencia |
| **Pruebas de carga** | K6 (Grafana Labs) | — | Validación de RNF de latencia/concurrencia |
| **Infra** | Docker Compose | v2 | Single-node · 9 servicios · 8 GB RAM mín. |
| **CI/CD** | GitHub Actions + Gitea | — | Lint/test/build, push a GHCR, SBOM, Trivy |

---

## Módulos de la plataforma

| Módulo | Para quién | Qué hace |
|--------|-----------|----------|
| **Resumen** | Todos | Dashboard de bienvenida: onboarding "Primeros pasos", accesos rápidos, KPIs de inventario + **salud** (tasa de éxito, T_re, despliegues activos, calidad de datos) y estado operativo. |
| **Espacios de trabajo** | Todos | CRUD de proyectos + historial de ejecuciones. |
| **Lienzo** | Todos | Constructor visual del pipeline y ejecución del flujo. |
| **Gestión de Dataset** | Todos | Asignar/reemplazar/eliminar/descargar datasets, con **uso de disco real** por proyecto y cuota. |
| **Mis modelos** | Todos | Registro de modelos del usuario (versiones, métricas, stage, desplegar). |
| **Despliegues** | Todos | model-services activos, endpoint, cupo, **probador de `/predict`** (modal con previsualización). |
| **Monitoreo** | Todos | Telemetría del ciclo de vida + señal de **calidad/drift** por ejecución. |
| **Usuarios** | ADMIN | Alta y activación/desactivación de usuarios. |
| **Registro de modelos** | ADMIN | Consola global de MLflow (gobierno). |
| **Analítica** | ADMIN | Telemetría **global** de toda la plataforma (vista general + por modelo). |

---

## Ciclo de vida MLOps (end-to-end)

```
 Usuario              Backend            Kafka        ml-engine          MLflow / Docker
   │  Crear proyecto + dataset │            │              │                    │
   │──────────────────────────▶│            │              │                    │
   │  Armar pipeline (Lienzo)  │            │              │                    │
   │  "Iniciar flujo"          │  job ─────▶│──── consume ▶│  ingesta →         │
   │──────────────────────────▶│            │              │  preproc → split → │
   │   logs SSE en vivo ◀───────┼──── logs ──┼──────────────│  entrenar (CNN) →  │
   │                           │            │              │  métricas + drift →│
   │                           │  result ◀──│◀──── publish │  registrar modelo ▶│ MLflow v_n
   │  (auto) Desplegar ────────▶│  build + DooD → levanta model-service :800x → /health ✓
   │  Probar /predict ─────────▶│  proxy ────────────────────────────────────▶ model-service
   │  Monitoreo / Analítica ◀───┤  T_re · LT_d · cold start · calidad/drift
```

Si el flujo **no** lleva nodo de Despliegue, termina en el entrenamiento (válido: el modelo queda registrado y se puede desplegar luego desde *Mis modelos*).

---

## ML Engine: CNN adaptativa + Transfer Learning

El `ml-engine` consume trabajos de Kafka y los ejecuta con **Template Method + Strategy**:

```
PipelineExecutor.execute(job)                ← Template Method (pasos fijos)
  1. Ingesta     → carga (uint8 en RAM, 4× menos memoria) + split 3-vías
  2. Preprocess  → normalización {minmax|zscore|rescale} + Data Augmentation
                   selectiva (10 técnicas) + balanceo de clases (solo train)
  3. Split       → train / val / test (explícito o auto por % Train)
  4. Entrenar    → TensorFlowStrategy | PyTorchStrategy        ← Strategy (factory)
                   CNN adaptativa  ó  Transfer Learning (FE → FT)
  5. Métricas    → sklearn (precision/recall/f1/roc-auc) en train/val/test + matriz confusión
  6. Interpret.  → galería Score-CAM (artefacto MLflow)
  7. Drift       → Evidently + PSI (split-quality y re-entrenamiento)
  8. Registrar   → MLflow (params, métricas, artefacto, versión, reportes, Score-CAM)
       ├── Eventos por fase/época → Kafka logs → SSE (consola en vivo)
       └── Resultado final        → Kafka results → orquestador (BD + telemetría)
```

### Arquitecturas de entrenamiento

| Arquitectura | Tipo | Cuándo usarla |
|---|---|---|
| **CNN adaptativa** | Desde cero (TF/PyTorch) | Datasets simples (MNIST-like); se dimensiona sola al `input_shape` (2–3 bloques conv, `GAP → Dense → Dropout → softmax`). |
| **EfficientNetB0** | Preentrenada ImageNet | Buen equilibrio precisión/tamaño en datasets reales. |
| **MobileNetV2** | Preentrenada ImageNet | Ligera; rápida en CPU/edge. |
| **ResNet50** | Preentrenada ImageNet | Mayor capacidad para datasets medianos/complejos. |

**Transfer Learning en 2 fases** (arquitecturas preentrenadas), configurable por nodo:
- **Fase 1 · Feature Extraction:** backbone **congelado**, se entrena solo la cabeza nueva con un LR alto (default 1e-3) durante `feature_extraction_epochs`.
- **Fase 2 · Fine-Tuning:** se **descongelan las últimas N capas** (configurable) y se continúa con un LR muy bajo (default 1e-5) durante `finetuning_epochs` — la diferencia de ~100× evita destruir los pesos de ImageNet. `finetuning_epochs = 0` ⇒ solo feature extraction (datasets pequeños).
- **Resolución configurable [96–224 px]** (no se fuerza 224): 224 = máxima calidad, 160 ≈ mitad de memoria, 128 = ligero.
- **Caché de embeddings en FE** (sin augmentation): el backbone congelado se ejecuta **una sola vez** y se entrena solo la cabeza → mucho menos cómputo/memoria, clave en CPU.

**Regularización y opciones** (CNN y backbones): **Dropout**, **L2**, optimizador (`adam/adamw/sgd/rmsprop`), BatchNorm, **Early Stopping dual** (val_loss y/o val_accuracy, con restauración de mejores pesos).

**Optimización automática de hiperparámetros (HPO con Optuna):** un nodo dedicado de **Hiperparámetros** (separado del de Entrenamiento) ofrece el modo *Optimización automática*: Optuna prueba varias combinaciones (learning rate, dropout, optimizador, L2 y, en Transfer Learning, los LR de cada fase + capas a descongelar), entrenando un modelo **proxy** barato por *trial* con **pruning** (corta pronto los malos) y **esfuerzo** configurable (rápido/equilibrado/exhaustivo), y **reentrena el ganador** con el dataset completo. Pensado para usuarios menos experimentados; el ajuste **manual** (a criterio) sigue disponible al desactivarlo.

### Data Augmentation selectivo + balanceo de clases

- **Catálogo de 10 técnicas** activables por separado con su parámetro: flip H/V, rotación, brillo, contraste, saturación, nitidez, zoom/crop, ruido gaussiano y traslación. **Paridad TensorFlow ↔ PyTorch** (mismas técnicas e intensidades). Se aplica *in-graph* (no se hornea en el artefacto).
- **Balanceo de clases** (multiclase 2–50): `oversample` (variantes augmentadas de minoritarias), `undersample` (recorte de mayoritarias) o `hybrid`, con **umbral** configurable y **solo sobre el train** (val/test intactos). Determinista (semilla fija).

### Interpretabilidad (Score-CAM)

Tras entrenar, se genera una **galería Score-CAM** (original · heatmap · overlay) sobre muestras del test, marcando aciertos (verde) y errores (rojo): muestra *en qué regiones se fija el modelo*. Se guarda como artefacto en MLflow y se visualiza en el detalle del modelo. Multiclase, paridad TF/PyTorch, best-effort.

### Métricas honestas (test ciego)

Para datasets sin split de test explícito, el ml-engine reserva un **test ciego** (split 3-vías estratificado). La métrica **principal** se reporta sobre el **test** (datos no vistos ni usados en early-stopping) — no sobre validación — para evitar métricas optimistas. Se calculan **precision/recall/f1/roc-auc para los tres splits** (train/val/test), agrupadas y diferenciadas por color en la UI.

### Optimización de recursos

- **Dataset en uint8** (RAM/VRAM): se materializa en uint8 y el cast a float [0,1] se hace por lote → **4× menos memoria**.
- **Hardening anti-OOM:** extracción de features de drift por chunks, PyTorch mantiene los datos en CPU (mueve solo el lote a la GPU), cap de imágenes según memoria disponible y **aviso de huella estimada** antes de entrenar.
- **GPU:** detección automática (CUDA/MPS/CPU con *fallback* seguro), `memory_growth`, y `cuda_malloc_async` para devolver VRAM al driver entre runs.
- **De-duplicación de memoria:** el entrenamiento ya no copia el dataset — TF lo alimenta desde un generador (en vez de `from_tensor_slices`) y PyTorch comparte el buffer (`from_numpy`); val/test se evalúan por lote → **pico de RAM ~2× menor** (≈75k imágenes a 160px entrenan enteras).
- **Normalización Min-Max [0,1] única:** se retiraron zscore/rescale (rompían los backbones preentrenados y cuadruplicaban la memoria).
- **Aislamiento por subproceso:** cada entrenamiento corre en un proceso hijo (`spawn`); un OOM/crash mata solo al hijo → el consumidor sigue vivo y el contenedor **no reinicia**.
- **Límites de memoria por servicio** (`ML_ENGINE_MEM_LIMIT` / `BACKEND_MEM_LIMIT`) + plantilla `.wslconfig` (`infra/wsl/wslconfig.example`) para darle a la VM de WSL2 la RAM real del host.

---

## Calidad de datos y Data Drift

SynapseOps vigila la **calidad del entrenamiento** y la **deriva de datos** y la muestra al usuario:

| Señal | Qué detecta | Dónde se muestra |
|-------|-------------|------------------|
| **Overfitting** | Gap entre accuracy de train y validación (umbrales 8% / 15%) | Banner en el nodo Entrenamiento + columna *Calidad* en Monitoreo |
| **Drift de split** | La validación distribuye distinto del train (split sesgado) | Nodo Entrenamiento + Monitoreo |
| **Drift de re-entrenamiento** | El dataset cambió respecto a la corrida anterior del mismo proyecto | Nodo Entrenamiento + Monitoreo |
| **Drift de inferencia** | Las imágenes que llegan a `/predict` difieren del entrenamiento | Prometheus (`inference_drift_psi`) + endpoint `/drift` del model-service |

La señal numérica usa **PSI** (Population Stability Index) sobre features compactas (media/σ por canal, brillo, contraste) — robusta e interpretable — y se complementa con un **reporte Evidently** guardado como artefacto del run en MLflow.

---

## Despliegue dinámico de inferencia

Al desplegar (automático al terminar el flujo, o manual desde *Mis modelos* / *Despliegues*), el orquestador:

1. Descarga/valida el artefacto del modelo desde MLflow / `/storage`.
2. **Genera** el `Dockerfile` y `docker-compose.yml` del model-service (SnakeYAML) y los valida.
3. **Construye** la imagen y **levanta** el contenedor `modelo_{workspaceId}` con **puerto dinámico** vía DooD.
4. Ejecuta un **health-check** con reintentos y mide el **cold start** (ms).
5. Expone `/predict` (acepta imagen base64 o multipart), `/health` y `/metrics`.

Cupo configurable de despliegues concurrentes (default 3, alineado con el presupuesto de 8 GB). El módulo **Despliegues** incluye un **probador de inferencia** (modal con drag-and-drop, previsualización y soporte de múltiples imágenes).

---

## Telemetría y Observabilidad

- **Process Tracker (backend):** marca de tiempo de cada fase del ciclo y cálculo de **T_re** (tiempo de re-entrenamiento), **LT_d** (lead time de despliegue), **cold start**, **tasa de completitud**, **tasa de despliegues exitosos** y **esfuerzo de interacción**. Endpoints `/telemetry/*` (usuario) y `/analytics/*` (global, ADMIN), con export CSV.
- **Stack Prometheus/Grafana:** cAdvisor recolecta métricas de contenedores; Prometheus las scrapea (incluye `/actuator/prometheus` del backend y `/metrics` del ml-engine y de cada model-service vía Docker SD); Grafana provisiona el dashboard *MLOps Platform Overview* (CPU, RAM, latencia P95 de inferencia, contenedores, throughput).

> En **Docker Desktop / WSL2**, los paneles por-contenedor de cAdvisor pueden mostrar "No data" (limitación de cgroups del entorno); funcionan en un host Linux. Los paneles de inferencia (P95, throughput) sí se pueblan en cualquier entorno.

---

## Datasets soportados

| Tipo | Método | Detalle |
|------|--------|---------|
| **Built-in (Keras)** | `keras://mnist`, `keras://fashion_mnist` | Cargados como numpy (sin TensorFlow). 28×28×1, 10 clases. |
| **URL** | `{ "url": "https://…/data.zip" }` | `.zip` público. **Blindado:** valida content-type, sigue redirecciones, detecta páginas HTML/login (Kaggle), tope de tamaño y anti *zip-slip*. |
| **Subida ZIP / imagen** | `multipart/form-data` | `.zip` con imágenes o `.png/.jpg/.jpeg` sueltas. |

**Autodetección de layout** (datasets propios): splits explícitos con **nombres tolerantes** — reconoce `train/val[/test]` y variantes como `Train_Set_Folder`, `Validation Set`, `test-data`, `trainSet`, etc. (clasificación por token, sin confundir clases reales como `testtubes`) —, **carpetas-clase planas** (auto-split 3-vías), **solo `train/`** y estructuras con carpetas hermanas (ignora `annotations/`, docs, metadata). Guardrails de memoria: ≤ 50 clases, ≤ 50 000 imágenes (submuestreo estratificado), ≥ 2 clases. **Cuota de disco por workspace** configurable.

---

## Prerrequisitos

- **Docker Desktop** ≥ 4.x con Docker Compose v2
- **RAM** ≥ 8 GB (16 GB recomendado para entrenar)
- **CPU** ≥ 4 núcleos · **Disco** ≥ 10 GB libres
- (Opcional) GPU NVIDIA + NVIDIA Container Toolkit para entrenamiento acelerado

---

## Instalación y Despliegue

### 1. Clonar

```bash
git clone https://github.com/Tunkifloo/SynapseOps-platform.git
cd SynapseOps
```

### 2. Variables de entorno

Crea un `.env` en la raíz del proyecto (lo lee `docker compose`):

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
STORAGE_MAX_FILE_SIZE_MB=1000      # tamaño máx. por archivo
STORAGE_MAX_WORKSPACE_MB=2000      # cuota de disco por proyecto

# ── Límites de memoria por contenedor (opcional) ───────────
# No limitan en hosts de 8 GB (la VM de WSL2 es menor); en labs de 16 GB+ acotan y
# hacen coherente el cálculo de memoria del ml-engine. Ver infra/wsl/wslconfig.example.
ML_ENGINE_MEM_LIMIT=12g            # sube a 13g en hosts de 16 GB+ para datasets grandes
BACKEND_MEM_LIMIT=2g               # acota el heap de la JVM (WebFlux no necesita más)

# ── Perfil ─────────────────────────────────────────────────
SPRING_PROFILES_ACTIVE=prod
```

### 3. Levantar el stack

```bash
docker compose up -d --build      # construye y levanta los 9 servicios
docker compose ps                 # verifica que estén healthy
```

### 3.1. CPU vs GPU (NVIDIA)

El `ml-engine` detecta GPU automáticamente (`tf.config` / `torch.cuda`) y hace *fallback* a CPU.

```bash
# CPU (laboratorio estándar, default)
docker compose up -d --build

# GPU (host con driver NVIDIA + Container Toolkit; en Windows, Docker Desktop + WSL2)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml build ml-engine
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

> El override GPU compila la capa de frameworks con `requirements-frameworks-gpu.txt` (TensorFlow[and-cuda] + PyTorch CUDA) y reserva la GPU. ⚠️ La imagen GPU es grande — asegura disco libre.

### 4. Verificar y acceder

```bash
curl http://localhost:8080/actuator/health   # backend
curl http://localhost:8000/health            # ml-engine
```

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| **Frontend** | http://localhost:3000 | `superadmin` / tu `ADMIN_PASSWORD` |
| **Swagger (API)** | http://localhost:8080/swagger-ui.html | — |
| **MLflow** | http://localhost:5000 | — |
| **Grafana** | http://localhost:3001 | `admin` / tu `GRAFANA_PASSWORD` |
| **Prometheus** | http://localhost:9090 | — |

---

## Servicios y Puertos

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| `frontend-app` | 3000 | Interfaz React (nginx + proxy `/api/v1`) |
| `backend-orchestrator` | 8080 | API REST reactiva + Swagger + telemetría |
| `ml-engine` | 8000 | FastAPI: entrenamiento, ingesta, drift |
| `mlflow-server` | 5000 | Tracking + Model Registry |
| `grafana-dashboard` | 3001 | Dashboards de observabilidad |
| `prometheus-tsdb` | 9090 | Métricas (TSDB) |
| `cadvisor` | 8081 | Métricas de contenedores |
| `postgres-db` | 5432 | Base de datos |
| `kafka-broker` | 9092 / 9094 | Mensajería (KRaft) |
| `modelo_{ws}` | 8001+ | model-service de inferencia (creado en runtime) |

---

## Validación de Rendimiento (RNF)

Pruebas de carga con **K6** (decisión ADR-006) sobre `/predict` del model-service:

| Requisito | Métrica | Umbral | Resultado |
|-----------|---------|--------|-----------|
| **RN-002** | Latencia P95 de `/predict` (50 VUs) | < 2.0 s | **29 ms** ✅ |
| **RN-002** | Tasa de error | < 1 % | **0 %** ✅ |
| **RN-001** | RAM total del stack bajo carga | ≤ 6 GB | **4.76 GB** ✅ |
| **RN-001** | CPU total del stack bajo carga | ≤ 4 núcleos | ~4 (marginal) ⚠️ |

Harness reproducible en `infra/load-tests/` (script K6, parser de resultados, muestreo de recursos).

---

## CI/CD

- **GitHub Actions** (`.github/workflows/ci-cd.yml`): lint + tests unitarios (backend JUnit, frontend Vitest, ml-engine pytest) + **build del frontend**; en `main`/tags `v*` construye y publica 3 imágenes a **GHCR** con **SBOM + provenance**, **escaneo Trivy** (→ GitHub Security) y `dependency-review` en PRs. Concurrencia, cachés (Maven/npm/pip) y permisos mínimos.
- **Gitea (local)** ejecuta el pipeline principal con los tests de integración (Testcontainers: PostgreSQL + Kafka).

---

## Estructura del Monorepo

```
SynapseOps/
├── Backend/
│   ├── backend-orchestrator/        # Spring Boot 4 / WebFlux
│   │   ├── src/main/java/.../{config,controller,domain,infra,service,mapper}
│   │   ├── src/main/resources/db/migration/   # Flyway V1–V11
│   │   └── Dockerfile
│   ├── ml-engine/                   # FastAPI + Python 3.11
│   │   ├── app/{kafka,pipeline,infra,api}/
│   │   │   └── pipeline/{executor.py, drift.py, training/}
│   │   └── Dockerfile
│   └── model-service/               # Plantilla del servicio de inferencia (TA-007)
│       └── server.py                # /predict · /health · /metrics · /drift
├── frontend/                        # React 18 + TypeScript + Vite
│   └── src/{features,shared,store,app}/
├── infra/
│   ├── prometheus/prometheus.yml
│   ├── grafana/{provisioning,dashboards}/
│   └── load-tests/                  # K6 + parsers + muestreo de recursos
├── .github/workflows/ci-cd.yml
├── docker-compose.yml               # 9 servicios
├── docker-compose.gpu.yml           # override GPU del ml-engine
└── .env                             # variables (no commitear)
```

---

## Architectural Decision Records (ADRs)

| ADR | Decisión | Justificación |
|-----|---------|---------------|
| ADR-001 | React + React Flow para el lienzo | Drag & drop, nodos custom con estado visual en vivo |
| ADR-002 | SSE para logs en tiempo real | Unidireccional, sin overhead de WebSocket bidireccional |
| ADR-003 | Prometheus + Grafana + cAdvisor | Estándar de facto para métricas de contenedores |
| ADR-004 | Docker-outside-of-Docker (DooD) | El orquestador maneja el Docker del host para desplegar model-services |
| ADR-005 | Patrones SOLID (Strategy/Builder/Facade/Template Method) | Estrategias TF/PyTorch intercambiables sin tocar el executor |
| ADR-006 | **K6** para pruebas de carga (vs JMeter) | Bajo overhead, scripting versionable, percentiles nativos |
| ADR-007 | MLflow como fuente única de verdad | API REST: artefactos, runs y versiones programáticos |
| ADR-008 | Kafka KRaft (sin ZooKeeper) | Broker+controller en un contenedor; CI principal en Gitea |
| ADR-009 | SnakeYAML para IaC generado en runtime | Dockerfile/compose del model-service tipados y validados |
| ADR-011 | Spring WebFlux reactivo | I/O no bloqueante para pipelines de entrenamiento largos |

---

## Tópicos Kafka

| Tópico | Dirección | Descripción |
|--------|-----------|-------------|
| `mlops.pipeline.requests` | orchestrator → ml-engine | Job de entrenamiento con hiperparámetros |
| `mlops.pipeline.results` | ml-engine → orchestrator | Resultado: `run_id`, `model_version`, métricas, drift, overfitting |
| `mlops.pipeline.logs` | ml-engine → orchestrator | Eventos por fase/época → SSE (consola en vivo) |

---

## Roles y Permisos

| Acción | COLLABORATOR | ADMIN |
|--------|:---:|:---:|
| Crear/gestionar workspaces, datasets, pipelines propios | ✅ | ✅ |
| Entrenar, desplegar y probar inferencia propia | ✅ | ✅ |
| Ver telemetría (Monitoreo) propia | ✅ | ✅ |
| Ver todos los usuarios · activar/desactivar | ❌ | ✅ |
| Registro global de modelos (MLflow) | ❌ | ✅ |
| Analítica global de la plataforma | ❌ | ✅ |
| Ver todos los workspaces | ❌ | ✅ |

---

## API Reference

Swagger completo en `http://localhost:8080/swagger-ui.html`. Endpoints principales:

```
# Auth
POST   /api/v1/auth/login | /logout

# Workspaces · Datasets
GET|POST|PUT|DELETE  /api/v1/workspaces[/{id}]
POST   /api/v1/workspaces/{id}/dataset          # subir .zip/imagen
POST   /api/v1/workspaces/{id}/dataset/url      # URL o keras://
GET|DELETE /api/v1/workspaces/{id}/dataset/{file}

# Pipelines · Canvas · Ejecuciones
GET|POST|PUT|DELETE /api/v1/workspaces/{w}/pipelines[/{p}]
GET|PUT  /api/v1/workspaces/{w}/pipelines/{p}/canvas
POST   /api/v1/workspaces/{w}/pipelines/{p}/execute
GET    /api/v1/workspaces/{w}/pipelines/{p}/executions[/{e}]
GET    /api/v1/workspaces/{w}/pipelines/{p}/executions/{e}/logs   # SSE

# Despliegues (model-services)
GET    /api/v1/deployments
POST   /api/v1/deployments                      # body: { runId }
DELETE /api/v1/deployments/{executionId}
POST   /api/v1/deployments/{executionId}/predict

# Telemetría (usuario) y Analítica (ADMIN)
GET    /api/v1/telemetry/{lifecycle,by-model,lifecycle.csv}
GET    /api/v1/analytics/{lifecycle,by-model,lifecycle.csv}

# Storage · Mis modelos · MLflow (ADMIN) · Usuarios (ADMIN)
GET    /api/v1/storage/{limits,usage}
GET    /api/v1/workspaces/{w}/models[/{name}/versions[/{v}/details]]
GET    /api/v1/mlflow/{health,experiments,models,runs/{id}}
GET|POST /api/v1/users ; PATCH /api/v1/users/{id}
```

---

## Roadmap

- [x] **Sprint 1** — Arquitectura base: orchestrator, ml-engine, Kafka, MLflow, PostgreSQL, JWT/RBAC.
- [x] **Sprint 2** — Lienzo low-code (5 nodos) + *Iniciar flujo*, logs SSE en vivo, modelos versionados (RBAC), CNN configurable + métricas avanzadas, dataset blindado, build CPU/GPU.
- [x] **Sprint 3** — Despliegue dinámico de model-services (`/predict`), telemetría de ciclo de vida (Process Tracker) + módulos Monitoreo/Analítica, **detección de calidad y data drift** (Evidently + PSI), observabilidad Prometheus/Grafana, split 3-vías con test ciego, validación de RNF con K6, gestión de almacenamiento con cuotas, CI/CD endurecido.

---

## Contribuidores

| Nombre | Rol |
|--------|-----|
| **Adrian Nicolás Cisneros Bartra** | Arquitecto · Full Stack · ML Engineer |
| **Alfredo Rogger Guzman Moscol** | Full Stack · QA Engineer |
| **Walter Cueva Chavez** | Asesor Técnico |

---

## Licencia

```
MIT License — Copyright (c) 2026 Adrian Cisneros, Alfredo Guzman
```

---

<div align="center">

**SynapseOps** — *Del dataset al endpoint, en un lienzo.*

`docker compose up -d` — Un comando. Nueve servicios. Ciclo MLOps completo.

</div>
