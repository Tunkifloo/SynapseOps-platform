// SynapseOps · Prueba de carga del model-service (RN-001/RN-002 · ADR-006 · K6).
//
// Mide la latencia P95 y la tasa de error del endpoint POST /predict bajo concurrencia,
// validando los RNF: P95 < 2000 ms y error_rate < 1% con 50 usuarios virtuales (VUs).
//
// Configuración por variables de entorno (__ENV):
//   TARGET     URL completa del /predict (obligatoria). Ej. http://modelo_1:8000/predict
//   MODE       pilot | load | stress   (default: load)
//   IMAGE_B64  imagen en base64 (default: PNG 64x64 embebido)
//
// Ejecución (k6 en contenedor, dentro de la red del stack):
//   docker run --rm --network mlops-network -v "${PWD}/infra/load-tests:/s" \
//     -e TARGET=http://modelo_1:8000/predict -e MODE=load \
//     grafana/k6 run --summary-export=/s/summary.json /s/predict_test.js
import http from 'k6/http'
import { check } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const TARGET = __ENV.TARGET
if (!TARGET) {
  throw new Error('Falta la variable TARGET (URL del /predict). Ej: http://modelo_1:8000/predict')
}
const MODE = __ENV.MODE || 'load'

// PNG 64x64 embebido (el model-service lo redimensiona; sirve para medir latencia).
const IMAGE_B64 = __ENV.IMAGE_B64 ||
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAgElEQVR4nNXOQREAIAzAsFLVyEEOshCxB9co' +
  'yNrnUiZxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidx' +
  'EidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEufvwNQDuioCYPNUMFMAAAAASUVORK5CYII='

const latency = new Trend('predict_latency', true)
const errorRate = new Rate('error_rate')

// Planes de prueba (ADR-006 §6). Umbrales RNF: P95 < 2000 ms, error < 1%.
const PLANS = {
  pilot:  { stages: [{ duration: '30s', target: 10 }],
            thresholds: { 'http_req_duration': ['p(95)<2000'], 'error_rate': ['rate<0.01'] } },
  load:   { stages: [
              { duration: '30s', target: 10 },   // ramp-up inicial
              { duration: '30s', target: 50 },   // ramp-up hasta 50 VUs (RNF)
              { duration: '60s', target: 50 },   // carga sostenida
              { duration: '30s', target: 0 },    // ramp-down
            ],
            thresholds: { 'http_req_duration': ['p(95)<2000'], 'error_rate': ['rate<0.01'] } },
  stress: { stages: [
              { duration: '30s', target: 50 },
              { duration: '60s', target: 100 },  // estrés: el sistema no debe colapsar
              { duration: '30s', target: 0 },
            ],
            thresholds: { 'error_rate': ['rate<0.05'] } },   // < 5% (degradación tolerada)
}

export const options = {
  ...(PLANS[MODE] || PLANS.load),
  // Percentiles en el resumen (por defecto k6 omite p99).
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

const PAYLOAD = JSON.stringify({ image: IMAGE_B64 })
const PARAMS = { headers: { 'Content-Type': 'application/json' }, timeout: '10s' }

export default function () {
  const res = http.post(TARGET, PAYLOAD, PARAMS)
  latency.add(res.timings.duration)
  errorRate.add(res.status !== 200)
  check(res, {
    'status 200': (r) => r.status === 200,
    'P95 objetivo (<2000ms)': (r) => r.timings.duration < 2000,
    'respuesta con body': (r) => r.body && r.body.length > 0,
  })
}

// Escribe el resumen a JSON (camino fiable; `--summary-export` está deprecado) y un
// resumen conciso a stdout. El JSON lo consume parse_k6_results.py (RN-002).
const SUMMARY_PATH = __ENV.SUMMARY || '/s/summary.json'

export function handleSummary(data) {
  const m = data.metrics
  const g = (metric, stat) =>
    (m[metric] && m[metric].values && m[metric].values[stat] != null) ? m[metric].values[stat] : null
  const f = (v, d = 1) => (v == null ? '—' : v.toFixed(d))
  const out = [
    '',
    '── Resumen K6 · POST /predict ──',
    `  Peticiones : ${g('http_reqs', 'count') ?? '—'}  (${f(g('http_reqs', 'rate'))} req/s)`,
    `  Latencia   : avg ${f(g('http_req_duration', 'avg'))} ms · p90 ${f(g('http_req_duration', 'p(90)'))} ms`
      + ` · p95 ${f(g('http_req_duration', 'p(95)'))} ms · p99 ${f(g('http_req_duration', 'p(99)'))} ms`,
    `  Error rate : ${f((g('error_rate', 'rate') || 0) * 100)} %`,
    '',
  ].join('\n')
  return {
    stdout: out,
    [SUMMARY_PATH]: JSON.stringify(data),
  }
}
