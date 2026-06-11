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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.security.Principal;

/**
 * TEL-02 · Telemetría de "Process (Lifecycle)" (OE4): indicadores agregados del ciclo
 * de vida (re-entrenamiento, lead time de despliegue, tasas) y export CSV para el
 * análisis estadístico de la muestra de 30-31 proyectos. Solo lectura.
 */
@RestController
@RequestMapping("/api/v1/telemetry")
@RequiredArgsConstructor
@Tag(name = "Telemetry", description = "Indicadores de ciclo de vida (OE4 · Process/Lifecycle)")
@SecurityRequirement(name = "bearerAuth")
public class TelemetryController {

    private final TelemetryService telemetryService;

    @Operation(summary = "Indicadores de ciclo de vida del usuario",
            description = "Tasas (completitud, despliegues exitosos) + T_re/LT_d/cold start por ejecución.")
    @GetMapping("/lifecycle")
    public Mono<ResponseEntity<LifecycleMetricsResponse>> lifecycle(Mono<Principal> principal) {
        return principal.flatMap(p -> telemetryService.lifecycleMetrics(p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Indicadores por modelo del usuario",
            description = "Agrupa las métricas de ciclo de vida + calidad ML por modelo (nombre MLflow).")
    @GetMapping("/by-model")
    public Mono<ResponseEntity<ByModelView>> byModel(Mono<Principal> principal) {
        return principal.flatMap(p -> telemetryService.byModelMetrics(p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Export CSV de indicadores de ciclo de vida",
            description = "Filas por ejecución (T_re, LT_d, cold start, esfuerzo) para análisis estadístico.")
    @GetMapping(value = "/lifecycle.csv", produces = "text/csv")
    public Mono<ResponseEntity<String>> lifecycleCsv(Mono<Principal> principal) {
        return principal.flatMap(p -> telemetryService.lifecycleCsv(p.getName()))
                .map(csv -> ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION,
                                "attachment; filename=\"lifecycle-metrics.csv\"")
                        .contentType(MediaType.parseMediaType("text/csv"))
                        .body(csv));
    }
}
