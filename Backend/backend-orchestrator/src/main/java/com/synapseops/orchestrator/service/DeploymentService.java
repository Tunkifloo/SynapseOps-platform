package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.response.DeploymentResponse;
import reactor.core.publisher.Mono;

public interface DeploymentService {
    Mono<DeploymentResponse> deploy(Long executionId, String username);
    Mono<DeploymentResponse> getDeploymentStatus(Long executionId, String username);
    Mono<Void> undeploy(Long executionId, String username);
}
