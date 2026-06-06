package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.PipelineRequest;
import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface PipelineService {
    Flux<PipelineResponse> getPipelinesByWorkspace(Long workspaceId, String username);
    Mono<PipelineResponse> getPipelineById(Long id, Long workspaceId, String username);
    Mono<PipelineResponse> createPipeline(Long workspaceId, PipelineRequest request, String username);
    Mono<PipelineResponse> renamePipeline(Long id, Long workspaceId, PipelineRequest request, String username);
    Mono<Void> deletePipeline(Long id, Long workspaceId, String username);
    Mono<Void> saveCanvas(Long id, Long workspaceId, String canvasJson, String username);
    Mono<String> getCanvas(Long id, Long workspaceId, String username);
}