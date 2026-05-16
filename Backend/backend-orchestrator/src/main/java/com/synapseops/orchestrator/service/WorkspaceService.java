package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import com.synapseops.orchestrator.domain.dto.response.WorkspaceResponse;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface WorkspaceService {
    Flux<WorkspaceResponse> getMyWorkspaces(String username);
    Flux<WorkspaceResponse> getAllWorkspaces();
    Mono<WorkspaceResponse> getWorkspaceById(Long id, String username);
    Mono<WorkspaceResponse> createWorkspace(WorkspaceRequest request, String username);
    Mono<WorkspaceResponse> updateWorkspace(Long id, WorkspaceRequest request, String username);
    Mono<Void> deleteWorkspace(Long id, String username);
}
