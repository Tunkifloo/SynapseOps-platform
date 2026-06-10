package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.response.DeploymentResponse;
import com.synapseops.orchestrator.domain.dto.response.DeploymentsView;
import reactor.core.publisher.Mono;

public interface DeploymentService {
    Mono<DeploymentResponse> deploy(Long executionId, String username);

    /** HU-029 · Despliega resolviendo la ejecución a partir del runId (lo que envía el front). */
    Mono<DeploymentResponse> deployByRunId(String runId, String username);

    Mono<DeploymentResponse> getDeploymentStatus(Long executionId, String username);
    Mono<Void> undeploy(Long executionId, String username);

    /** HU-029 · Despliegues del usuario + cupo (módulo "Despliegues"). */
    Mono<DeploymentsView> listDeployments(String username);

    /** Proxy de inferencia: reenvía la imagen (base64) al /predict del model-service. */
    Mono<String> predict(Long executionId, String username, String base64Image);
}
