package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.infra.mlflow.MLflowFacade;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/mlflow")
@RequiredArgsConstructor
public class MLflowController {

    private final MLflowFacade mlflowFacade;

    @GetMapping("/health")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<String>> checkConnectivity() {
        return mlflowFacade.isReachable()
                .map(ok -> ok
                        ? ResponseEntity.ok("MLflow reachable en "
                                            + "${mlflow.tracking.uri}")
                        : ResponseEntity.status(503)
                          .body("MLflow unreachable"));
    }

    @GetMapping("/runs/{runId}/artifact-uri")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<String>> getArtifactUri(
            @PathVariable String runId) {
        return mlflowFacade.getArtifactUri(runId)
                .map(ResponseEntity::ok);
    }
}