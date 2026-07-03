#!/usr/bin/env python3
"""
Smoke test del stack SynapseOps (post-despliegue / post-`docker compose up`).

Verifica de forma rápida que cada servicio "respira" y que la cadena crítica
auth -> JWT -> endpoint protegido responde. NO valida lógica de negocio en
profundidad (eso son los tests unitarios/integración); es la comprobación de humo
que se ejecuta tras levantar o desplegar el sistema.

Solo usa la librería estándar (urllib) -> no requiere instalar nada.

Uso:
    python infra/smoke-tests/smoke_test.py
    HOST=192.168.1.50 python infra/smoke-tests/smoke_test.py      # host remoto
Sale con código 0 si todo pasa; 1 si algún check falla.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

HOST = os.environ.get("HOST", "localhost")
ADMIN_USER = os.environ.get("SMOKE_USER", "superadmin")
ADMIN_PASS = os.environ.get("SMOKE_PASS", "admin123!")
TIMEOUT = float(os.environ.get("SMOKE_TIMEOUT", "8"))

GREEN, RED, YELL, RESET = "\033[92m", "\033[91m", "\033[93m", "\033[0m"


def _request(method, url, data=None, headers=None, timeout=TIMEOUT):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    if body is not None:
        req.add_header("Content-Type", "application/json")
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read().decode("utf-8", "replace")
            return resp.status, payload, (time.perf_counter() - started) * 1000
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), (time.perf_counter() - started) * 1000
    except Exception as e:  # noqa: BLE001 — conexión rechazada, timeout, DNS, etc.
        return None, str(e), (time.perf_counter() - started) * 1000


# ── Checks de disponibilidad (health) por servicio ──────────────────────────────
HEALTH_CHECKS = [
    ("frontend-app",         f"http://{HOST}:3000/",            lambda s, b: s == 200),
    ("backend-orchestrator", f"http://{HOST}:8080/actuator/health",
        lambda s, b: s == 200 and '"status":"UP"' in b.replace(" ", "")),
    ("ml-engine",            f"http://{HOST}:8000/health",      lambda s, b: s == 200),
    ("mlflow-server",        f"http://{HOST}:5000/health",      lambda s, b: s == 200),
    ("grafana-dashboard",    f"http://{HOST}:3001/api/health",  lambda s, b: s == 200),
    ("prometheus-tsdb",      f"http://{HOST}:9090/-/healthy",   lambda s, b: s == 200),
    ("cadvisor",             f"http://{HOST}:8081/healthz",     lambda s, b: s == 200),
]


def run():
    results = []  # (nombre, ok, detalle)

    print(f"\nSmoke test SynapseOps  ->  host={HOST}\n" + "=" * 64)

    # 1) Disponibilidad de servicios
    for name, url, ok_fn in HEALTH_CHECKS:
        status, body, ms = _request("GET", url)
        ok = status is not None and ok_fn(status, body)
        results.append((f"health · {name}", ok, f"HTTP {status} · {ms:.0f} ms"))

    # 2) Smoke FUNCIONAL: auth -> JWT (valida backend + PostgreSQL + JWT)
    status, body, ms = _request("POST", f"http://{HOST}:8080/api/v1/auth/login",
                                data={"username": ADMIN_USER, "password": ADMIN_PASS})
    token = None
    try:
        token = json.loads(body).get("token") if status == 200 else None
    except Exception:  # noqa: BLE001
        token = None
    results.append(("func · auth/login -> JWT", bool(token), f"HTTP {status} · {ms:.0f} ms"))

    # 3) Smoke de autorización: endpoint protegido con el JWT (valida filtro de seguridad)
    if token:
        status, body, ms = _request("GET", f"http://{HOST}:8080/api/v1/workspaces",
                                    headers={"Authorization": f"Bearer {token}"})
        results.append(("func · GET /workspaces (con JWT)", status == 200, f"HTTP {status} · {ms:.0f} ms"))
    else:
        results.append(("func · GET /workspaces (con JWT)", False, "omitido: sin token"))

    # ── Reporte ──────────────────────────────────────────────────────────────
    print(f"{'CHECK':40} {'RESULTADO':10} DETALLE")
    print("-" * 64)
    passed = 0
    for name, ok, detail in results:
        tag = f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"
        passed += 1 if ok else 0
        print(f"{name:40} {tag:19} {detail}")
    print("-" * 64)
    total = len(results)
    color = GREEN if passed == total else RED
    print(f"{color}{passed}/{total} checks OK{RESET}\n")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(run())
