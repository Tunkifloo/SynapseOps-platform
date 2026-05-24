package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.infra.mlflow.MLflowFacade;
import com.synapseops.orchestrator.infra.mlflow.MlflowRunMetrics;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/mlflow")
@RequiredArgsConstructor
@Tag(name = "MLflow", description = "Integración con MLflow Tracking Server y Model Registry")
@SecurityRequirement(name = "bearerAuth")
public class MLflowController {

    private final MLflowFacade mlflowFacade;

    @Operation(summary = "Health check del MLflow Tracking Server")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "MLflow operativo"),
            @ApiResponse(responseCode = "503", description = "MLflow no disponible")
    })
    @GetMapping("/health")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<Map<String, Object>>> checkHealth() {
        return mlflowFacade.isReachable()
                .map(ok -> {
                    Map<String, Object> body = new HashMap<>();
                    body.put("status",  ok ? "UP" : "DOWN");
                    body.put("service", "mlflow-server");
                    body.put("uri",     mlflowFacade.getTrackingUri());
                    return ResponseEntity.status(ok ? 200 : 503).body(body);
                });
    }

    @Operation(summary = "Listar experimentos MLflow",
            description = "Retorna todos los experimentos registrados en el Tracking Server.")
    @ApiResponse(responseCode = "200", description = "Lista de experimentos")
    @GetMapping("/experiments")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<List<Map<String, Object>>>> listExperiments() {
        return mlflowFacade.listExperiments()
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Listar modelos registrados en el Model Registry",
            description = "Muestra todos los modelos con su última versión y stage.")
    @ApiResponse(responseCode = "200", description = "Lista de modelos registrados")
    @GetMapping("/models")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<List<Map<String, Object>>>> listRegisteredModels() {
        return mlflowFacade.listRegisteredModels()
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Versiones de un modelo registrado",
            description = "Lista todas las versiones de un modelo con su run_id y stage.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Versiones encontradas"),
            @ApiResponse(responseCode = "404", description = "Modelo no encontrado")
    })
    @GetMapping("/models/{modelName}/versions")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<List<Map<String, Object>>>> getModelVersions(
            @PathVariable String modelName) {
        return mlflowFacade.getModelVersions(modelName)
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Resumen completo de un Run",
            description = "Retorna métricas, parámetros y artifact_uri de un run específico.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Resumen del run"),
            @ApiResponse(responseCode = "404", description = "Run ID no existe")
    })
    @GetMapping("/runs/{runId}")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<Map<String, Object>>> getRunSummary(
            @PathVariable String runId) {
        return mlflowFacade.getRunSummary(runId)
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Métricas de un Run",
            description = "Retorna accuracy, loss y val_accuracy de un run.")
    @ApiResponse(responseCode = "200", description = "Métricas del run")
    @GetMapping("/runs/{runId}/metrics")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<MlflowRunMetrics>> getRunMetrics(
            @PathVariable String runId) {
        return mlflowFacade.getRunMetrics(runId)
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Artifact URI de un Run")
    @ApiResponse(responseCode = "200", description = "URI del artefacto")
    @GetMapping("/runs/{runId}/artifact-uri")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<String>> getArtifactUri(
            @PathVariable String runId) {
        return mlflowFacade.getArtifactUri(runId)
                .map(ResponseEntity::ok);
    }
}