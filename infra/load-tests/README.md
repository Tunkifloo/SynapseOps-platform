# Pruebas de carga — RN-001 / RN-002 (K6 · ADR-006)

Valida los RNF de la plataforma sobre el endpoint `POST /predict` del model-service:

| RN | Criterio | Herramienta |
|----|----------|-------------|
| **RN-002** | P95 de latencia **< 2000 ms** y error **< 1%** con 50 VUs | K6 (`predict_test.js` + `parse_k6_results.py`) |
| **RN-001** | RAM total del stack **≤ 6 GB** y CPU **≤ 4 núcleos** durante la carga | `measure_resources.ps1` |

K6 no requiere instalación: se ejecuta con la imagen `grafana/k6` unida a la red `mlops-network`,
golpeando el model-service por su nombre de contenedor.

## Prerrequisito
Un model-service desplegado. Despliega un modelo desde el Lienzo o "Mis modelos" y anota su
contenedor (`modelo_<workspaceId>`). Verifícalo: `docker ps --filter name=modelo_`.

## Ejecución

**1. Muestreo de recursos (RN-001) — terminal A**, arráncalo justo antes de la carga:
```powershell
./infra/load-tests/measure_resources.ps1 -DurationSec 180 -IntervalSec 3
```

**2. Prueba de carga K6 (RN-002) — terminal B:**
```powershell
docker run --rm --network mlops-network -v "${PWD}/infra/load-tests:/s" `
  -e TARGET=http://modelo_1:8000/predict -e MODE=load `
  grafana/k6 run /s/predict_test.js
```
`MODE`: `pilot` (10 VUs/30s) · `load` (50 VUs, RNF) · `stress` (100 VUs).
El script escribe `summary.json` (vía `handleSummary`) en la misma carpeta.

**3. Evaluar el resultado de latencia (RN-002):**
```powershell
python ./infra/load-tests/parse_k6_results.py ./infra/load-tests/summary.json
```

## Correlación con Grafana / Prometheus (ADR-003)
Durante la carga, el dashboard "MLOps Platform Overview" (`:3001`) muestra CPU/RAM por contenedor
y la latencia P95 interna del model-service (`http_request_duration_seconds`), complementando la
medición externa de K6. Resultados y análisis: `docs/contexto/RN-001-002-load-test.md`.
