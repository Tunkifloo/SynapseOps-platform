package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.response.ByModelView;
import com.synapseops.orchestrator.domain.dto.response.LifecycleMetricsResponse;
import reactor.core.publisher.Mono;

/**
 * Indicadores de "Process (Lifecycle)" (OE4): tasas agregadas + filas por ejecución y
 * por modelo, derivadas de los timestamps del Process Tracker (TEL-01). Solo lectura.
 * Métodos {@code *user*} → alcance del usuario autenticado (módulo Monitoreo);
 * métodos {@code global*} → toda la plataforma (módulo Analítica, ADMIN).
 */
public interface TelemetryService {

    // ── Monitoreo (alcance: usuario autenticado) ────────────────────────────────
    Mono<LifecycleMetricsResponse> lifecycleMetrics(String username);
    Mono<String> lifecycleCsv(String username);
    /** Vista por modelo del usuario (ciclo de vida + calidad ML, agrupado por modelo). */
    Mono<ByModelView> byModelMetrics(String username);

    // ── Analítica (alcance: toda la plataforma, ADMIN) ──────────────────────────
    Mono<LifecycleMetricsResponse> globalLifecycleMetrics();
    Mono<ByModelView> globalByModelMetrics();
    Mono<String> globalLifecycleCsv();
}
