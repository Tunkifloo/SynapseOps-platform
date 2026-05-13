package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.infra.mlflow.MLflowFacade;
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

@RestController
@RequestMapping("/api/v1/mlflow")
@RequiredArgsConstructor
@Tag(name = "MLflow", description = "Diagnóstico de conectividad con el Tracking Server")
@SecurityRequirement(name = "bearerAuth")
public class MLflowController {

    private final MLflowFacade mlflowFacade;

    @Operation(summary = "Health check de MLflow (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "MLflow reachable"),
            @ApiResponse(responseCode = "503", description = "MLflow unreachable")
    })
    @GetMapping("/health")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<String>> checkConnectivity() {
        return mlflowFacade.isReachable()
                .map(ok -> ok
                        ? ResponseEntity.ok(
                        "MLflow reachable en " + mlflowFacade.getTrackingUri())
                        : ResponseEntity.status(503)
                          .body("MLflow unreachable en " + mlflowFacade.getTrackingUri()));
    }

    @Operation(summary = "Obtener artifact URI de un Run (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "URI del artefacto"),
            @ApiResponse(responseCode = "404", description = "Run ID no existe")
    })
    @GetMapping("/runs/{runId}/artifact-uri")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<String>> getArtifactUri(@PathVariable String runId) {
        return mlflowFacade.getArtifactUri(runId).map(ResponseEntity::ok);
    }
}