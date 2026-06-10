package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.DeployRequest;
import com.synapseops.orchestrator.domain.dto.request.PredictProxyRequest;
import com.synapseops.orchestrator.domain.dto.response.DeploymentResponse;
import com.synapseops.orchestrator.domain.dto.response.DeploymentsView;
import com.synapseops.orchestrator.service.DeploymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.security.Principal;

/**
 * Módulo "Despliegues" (HU-029): vista global de los model-services del usuario
 * y el cupo de despliegues concurrentes (TA-004).
 */
@RestController
@RequestMapping("/api/v1/deployments")
@RequiredArgsConstructor
@Tag(name = "Deployments", description = "Gestión de model-services desplegados (módulo Despliegues)")
@SecurityRequirement(name = "bearerAuth")
public class DeploymentsController {

    private final DeploymentService deploymentService;

    @Operation(summary = "Listar despliegues del usuario + cupo",
            description = "model-services del usuario con estado/puerto/cold start + tope (TA-004).")
    @GetMapping
    public Mono<ResponseEntity<DeploymentsView>> list(Mono<Principal> principal) {
        return principal.flatMap(p -> deploymentService.listDeployments(p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Desplegar un modelo por runId",
            description = "Resuelve la ejecución del run y despliega el model-service (HU-008; aplica el tope TA-004).")
    @PostMapping
    public Mono<ResponseEntity<DeploymentResponse>> deploy(
            @RequestBody DeployRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p -> deploymentService.deployByRunId(request.runId(), p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Derribar un despliegue",
            description = "Detiene y elimina el model-service de la ejecución (libera cupo y puerto).")
    @DeleteMapping("/{executionId}")
    public Mono<ResponseEntity<Void>> undeploy(
            @PathVariable Long executionId,
            Mono<Principal> principal) {
        return principal.flatMap(p -> deploymentService.undeploy(executionId, p.getName()))
                .thenReturn(ResponseEntity.<Void>noContent().build());
    }

    @Operation(summary = "Probar el /predict del model-service",
            description = "Proxy: reenvía la imagen (base64) al model-service y devuelve {prediction, confidence}.")
    @PostMapping(value = "/{executionId}/predict", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<String>> predict(
            @PathVariable Long executionId,
            @RequestBody PredictProxyRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p -> deploymentService.predict(executionId, p.getName(), request.image()))
                .map(ResponseEntity::ok);
    }
}
