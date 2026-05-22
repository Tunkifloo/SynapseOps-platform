package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.ExecutionRequest;
import com.synapseops.orchestrator.domain.dto.response.ExecutionResponse;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface ExecutionService {
    Mono<ExecutionResponse> launchExecution(Long pipelineId, Long workspaceId,
                                            ExecutionRequest request, String username);
    Mono<ExecutionResponse> getExecution(Long executionId, String username);
    Flux<ExecutionResponse> getExecutionsByPipeline(Long pipelineId, String username);
}
