# SynapseOps · Kit de Despliegue (offline)

Guía para levantar **SynapseOps** en una PC de laboratorio **sin internet** (sin login a
GHCR, sin `build`), usando imágenes Docker pre-exportadas. Pensado para Windows 11 +
Docker Desktop (WSL2); también sirve en Linux.

---

## 1. Contenido del kit

```
synapseops-deploy/
├── README-deploy.md              ← esta guía
├── docker-compose.yml            ← stack base (9 servicios)
├── docker-compose.gpu.yml        ← override para GPU NVIDIA (ml-engine con CUDA)
├── .env                          ← variables (REGISTRY + APP_VERSION ya configurados)
├── .env.example                  ← plantilla de referencia
├── infra/
│   ├── prometheus/prometheus.yml
│   └── grafana/{provisioning,dashboards}
└── Backend/
    └── model-service/            ← plantilla TA-007 (se monta para el despliegue dinámico)
```

> **El tar de imágenes (`synapseops-images.tar`, ~7 GB) NO viene dentro de este zip** (excede
> el límite de adjuntos). Descárgalo aparte (ver §3) y colócalo en esta misma carpeta.

---

## 2. Prerrequisitos (en cada PC del lab)

- **Docker Desktop ≥ 4.x** con Docker Compose v2 (WSL2 habilitado en Windows).
- **≥ 16 GB de RAM** y **≥ 20 GB de disco libre** (las imágenes con CUDA son grandes).
- **GPU (opcional):** driver **NVIDIA** instalado en Windows. Con Docker Desktop + WSL2 la
  GPU se expone vía el driver de Windows — **no** hace falta instalar el CUDA Toolkit ni el
  NVIDIA Container Toolkit dentro de WSL.
- Sin GPU, el sistema cae a **CPU automáticamente** (fallback seguro).

---

## 3. Obtener el tar de imágenes

El tar contiene **todas** las imágenes del stack (incluida `ml-engine:gpu`). Según cómo se
publicó el release, tómalo de una de estas formas y déjalo como
`synapseops-deploy/synapseops-images.tar`:

- **Partido en trozos** (adjuntos del release `synapseops-images.tar.part-*`):
  ```bash
  cat synapseops-images.tar.part-* > synapseops-images.tar     # Linux/WSL/Git Bash
  ```
  ```powershell
  cmd /c copy /b synapseops-images.tar.part-* synapseops-images.tar   # PowerShell/CMD
  ```
- **Enlace de Google Drive** (si así se compartió): descarga el `.tar` completo.

---

## 4. `.env` — punto CLAVE

El `.env` ya trae los valores correctos; **no los cambies**:

```dotenv
REGISTRY=ghcr.io/tunkifloo
APP_VERSION=latest
```

> Estos valores hacen que los nombres de imagen que **interpola el compose** coincidan
> EXACTAMENTE con los tags cargados desde el tar. Si no coinciden, Compose intentará hacer
> `pull` y **fallará offline**. (Completa también las credenciales de BD/JWT/Grafana del
> `.env.example` si tu `.env` no las trae.)

---

## 5. Levantar el stack (offline, sin build ni pull)

Desde la carpeta `synapseops-deploy/`:

```bash
# 1) Cargar todas las imágenes desde el tar (una sola vez por PC)
docker load -i synapseops-images.tar

# 2a) CPU (laboratorio estándar)
docker compose up -d --no-build

# 2b) GPU NVIDIA (entrena en la tarjeta; TF + PyTorch CUDA)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --no-build

# 3) Verificar
docker compose ps
```

`--no-build` y `--no-build`/`pull` evitados: arranca **solo** con las imágenes del tar.

---

## 6. Verificar y acceder

| Servicio | URL | Notas |
|---|---|---|
| **Frontend** | http://localhost:3000 | UI principal |
| **Backend (Swagger)** | http://localhost:8080/swagger-ui.html | API |
| **MLflow** | http://localhost:5000 | Registro de modelos/experimentos |
| **Grafana** | http://localhost:3001 | `admin` / `admin123` |

Usuario admin por defecto (login): **`superadmin`** · contraseña según el `.env`
(`ADMIN_PASSWORD`). El **model-service** de inferencia se crea **bajo demanda** al desplegar
un modelo (no aparece hasta entonces).

**Comprobar GPU (si aplica):**
```bash
docker exec ml-engine python -c "import tensorflow as tf, torch; print('TF GPU', bool(tf.config.list_physical_devices('GPU')), '| torch CUDA', torch.cuda.is_available())"
```

---

## 7. Problemas comunes

- **`pull access denied` / `manifest unknown` al `up`:** el `.env` no coincide con los tags del
  tar. Verifica `REGISTRY=ghcr.io/tunkifloo` y `APP_VERSION=latest`, y que hiciste `docker load`.
- **Error de montaje de `prometheus.yml` ("not a directory"):** ejecuta los comandos **dentro
  de la carpeta real** `synapseops-deploy/` (no desde un acceso directo de Drive). Los binds de
  `infra/` son relativos a esa carpeta.
- **La GPU no se usa (entrena en CPU):** confirma el driver NVIDIA en Windows y usa el override
  `-f docker-compose.gpu.yml`. Revisa `docker exec ml-engine nvidia-smi`.
- **Memoria al límite con datasets grandes:** baja el *tamaño de imagen* (p. ej. 160 px en
  Transfer Learning) o el *batch size* en el nodo de Entrenamiento; el sistema avisa la huella
  estimada antes de entrenar.

---

## 8. Apagar / actualizar

```bash
docker compose down            # detiene (conserva volúmenes/datos)
docker compose down -v         # también borra volúmenes (datos de cero)
```

Para una versión nueva: descarga el nuevo tar/kit, `docker load -i …`, y repite el `up`.
