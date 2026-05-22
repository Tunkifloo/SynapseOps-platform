package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.response.DeploymentResponse;
import com.synapseops.orchestrator.service.DeploymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/pipelines/{pipelineId}/executions/{executionId}")
@RequiredArgsConstructor
@Tag(name = "Deployment", description = "Despliegue dinámico del model-service via Docker")
@SecurityRequirement(name = "bearerAuth")
public class DeploymentController {

    private final DeploymentService deploymentService;

    @Operation(summary = "Desplegar model-service",
            description = "Construye imagen Docker y levanta contenedor model-service en :8500")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Despliegue iniciado — retorna containerId"),
            @ApiResponse(responseCode = "400", description = "Ejecución sin artefacto"),
            @ApiResponse(responseCode = "404", description = "Ejecución no encontrada")
    })
    @PostMapping("/deploy")
    public Mono<ResponseEntity<DeploymentResponse>> deploy(
            @PathVariable Long workspaceId,
            @PathVariable Long pipelineId,
            @PathVariable Long executionId,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        deploymentService.deploy(executionId, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Estado del despliegue")
    @GetMapping("/deploy/status")
    public Mono<ResponseEntity<DeploymentResponse>> getStatus(
            @PathVariable Long workspaceId,
            @PathVariable Long pipelineId,
            @PathVariable Long executionId,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        deploymentService.getDeploymentStatus(executionId, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Detener model-service")
    @ApiResponse(responseCode = "204", description = "Contenedor detenido")
    @DeleteMapping("/deploy")
    public Mono<ResponseEntity<Void>> undeploy(
            @PathVariable Long workspaceId,
            @PathVariable Long pipelineId,
            @PathVariable Long executionId,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        deploymentService.undeploy(executionId, p.getName()))
                .thenReturn(ResponseEntity.<Void>noContent().build());
    }
}
