package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.response.ByModelView;
import com.synapseops.orchestrator.domain.dto.response.LifecycleMetricsResponse;
import com.synapseops.orchestrator.service.TelemetryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * Módulo "Analítica" (ADMIN): telemetría GLOBAL de toda la plataforma (todos los usuarios)
 * para el estudio OE4 sobre la muestra de 30-31 proyectos. Distinto de "Monitoreo", que es
 * de alcance por usuario. Restringido a ADMIN.
 */
@RestController
@RequestMapping("/api/v1/analytics")
@RequiredArgsConstructor
@Tag(name = "Analytics", description = "Telemetría global de plataforma (ADMIN · estudio OE4)")
@SecurityRequirement(name = "bearerAuth")
@PreAuthorize("hasRole('ADMIN')")
public class AnalyticsController {

    private final TelemetryService telemetryService;

    @Operation(summary = "Indicadores de ciclo de vida GLOBALES",
            description = "Tasas y promedios sobre TODAS las ejecuciones de la plataforma (ADMIN).")
    @GetMapping("/lifecycle")
    public Mono<ResponseEntity<LifecycleMetricsResponse>> lifecycle() {
        return telemetryService.globalLifecycleMetrics().map(ResponseEntity::ok);
    }

    @Operation(summary = "Indicadores GLOBALES por modelo",
            description = "Métricas de ciclo de vida + calidad ML agrupadas por modelo, toda la plataforma.")
    @GetMapping("/by-model")
    public Mono<ResponseEntity<ByModelView>> byModel() {
        return telemetryService.globalByModelMetrics().map(ResponseEntity::ok);
    }

    @Operation(summary = "Export CSV global para el estudio OE4",
            description = "Todas las ejecuciones (muestra 30-31 proyectos) para el análisis estadístico.")
    @GetMapping(value = "/lifecycle.csv", produces = "text/csv")
    public Mono<ResponseEntity<String>> lifecycleCsv() {
        return telemetryService.globalLifecycleCsv()
                .map(csv -> ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION,
                                "attachment; filename=\"platform-lifecycle-metrics.csv\"")
                        .contentType(MediaType.parseMediaType("text/csv"))
                        .body(csv));
    }
}
