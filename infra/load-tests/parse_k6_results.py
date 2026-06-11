#!/usr/bin/env python3
"""Extrae los indicadores RN-002 del resumen de K6 (--summary-export) y evalúa el criterio.

Uso:
    python parse_k6_results.py summary.json

Reporta P95, P99, throughput y tasa de error; sale con código 1 si no cumple el RNF
(P95 < 2000 ms y error < 1%), para integrarse en CI (ADR-006 §3).
"""
import json
import sys


def main(path: str) -> int:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    metrics = data.get("metrics", {})

    def val(metric, stat):
        # Estructura de handleSummary: metrics[name].values[stat].
        return metrics.get(metric, {}).get("values", {}).get(stat)

    p95 = val("http_req_duration", "p(95)")
    p99 = val("http_req_duration", "p(99)")
    avg = val("http_req_duration", "avg")
    throughput = val("http_reqs", "rate")            # req/s
    total_reqs = val("http_reqs", "count")
    error_rate = val("error_rate", "rate") or 0.0    # 0..1

    p95_ok = p95 is not None and p95 < 2000
    err_ok = error_rate < 0.01
    tput_ok = throughput is not None and throughput > 20   # ADR-006 §6 (carga RNF)

    print("== RN-002 - Latencia de inferencia bajo carga (ADR-006) ==")
    print(f"  Peticiones totales : {total_reqs}")
    print(f"  Throughput         : {fmt(throughput)} req/s   [{ok(tput_ok)}] (> 20)")
    print(f"  Latencia avg       : {fmt(avg)} ms")
    print(f"  Latencia P95       : {fmt(p95)} ms          [{ok(p95_ok)}] (< 2000)")
    print(f"  Latencia P99       : {fmt(p99)} ms")
    print(f"  Tasa de error      : {fmt((error_rate or 0) * 100)} %        [{ok(err_ok)}] (< 1%)")

    passed = p95_ok and err_ok
    print(f"\n  RN-002: {'CUMPLE' if passed else 'NO CUMPLE'}")
    return 0 if passed else 1


def fmt(v):
    return "n/a" if v is None else f"{v:.1f}"


def ok(flag: bool) -> str:
    return "OK " if flag else "FALLA"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python parse_k6_results.py <summary.json>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
