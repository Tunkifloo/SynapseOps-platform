# Smoke Test — SynapseOps

Comprobación de humo del stack tras `docker compose up -d` o un despliegue: confirma que
cada servicio responde y que la cadena crítica **auth → JWT → endpoint protegido** funciona.
No reemplaza a las pruebas unitarias/integración; es la verificación rápida de "el sistema respira".

## Qué verifica

| # | Check | Tipo |
|---|---|---|
| 1–7 | Health de frontend, backend (`/actuator/health`), ml-engine (`/health`), MLflow, Grafana, Prometheus, cAdvisor | Disponibilidad |
| 8 | `POST /api/v1/auth/login` devuelve un JWT | Funcional (backend + PostgreSQL + JWT) |
| 9 | `GET /api/v1/workspaces` con el JWT responde 200 | Autorización (filtro de seguridad) |

## Ejecución

```bash
# Stack levantado (docker compose up -d)
python infra/smoke-tests/smoke_test.py
```

Solo usa la librería estándar de Python (no requiere instalar dependencias).
Sale con código `0` si todos los checks pasan y `1` si alguno falla (apto para CI/post-deploy).

## Parámetros (variables de entorno)

| Variable | Por defecto | Uso |
|---|---|---|
| `HOST` | `localhost` | Host del stack (p. ej. la IP de un laboratorio remoto) |
| `SMOKE_USER` | `superadmin` | Usuario para el smoke de login |
| `SMOKE_PASS` | `admin123!` | Contraseña |
| `SMOKE_TIMEOUT` | `8` | Timeout por petición (segundos) |

```bash
HOST=192.168.1.50 python infra/smoke-tests/smoke_test.py
```

## Resultado esperado

```
9/9 checks OK
```
