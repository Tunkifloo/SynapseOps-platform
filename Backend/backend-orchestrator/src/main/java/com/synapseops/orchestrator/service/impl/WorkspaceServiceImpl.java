package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import com.synapseops.orchestrator.domain.dto.response.WorkspaceResponse;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.domain.entity.Workspace;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.mapper.WorkspaceMapper;
import com.synapseops.orchestrator.service.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.List;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class WorkspaceServiceImpl implements WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final UserRepository      userRepository;
    private final WorkspaceMapper     workspaceMapper;

    @Override
    public Flux<WorkspaceResponse> getMyWorkspaces(String username) {
        return fetchWorkspaces(() -> {
            User user = resolveUser(username);
            return workspaceRepository.findByUser_IdUserAndUser_EnabledTrue(user.getIdUser());
        });
    }

    @Override
    public Flux<WorkspaceResponse> getAllWorkspaces() {
        return fetchWorkspaces(workspaceRepository::findAll);
    }

    @Override
    public Mono<WorkspaceResponse> getWorkspaceById(Long id, String username) {
        return Mono.fromCallable(() -> {
            Workspace workspace = resolveWorkspace(id);
            verifyOwnership(workspace, username);
            return workspaceMapper.toResponse(workspace);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<WorkspaceResponse> createWorkspace(WorkspaceRequest request, String username) {
        return Mono.fromCallable(() -> {
            User user = resolveUser(username);

            if (workspaceRepository.existsByNameAndUser_IdUser(request.name(), user.getIdUser())) {
                throw new IllegalArgumentException(
                        String.format("Ya tienes un workspace con el nombre '%s'.", request.name()));
            }

            Workspace workspace = new Workspace();
            workspace.setName(request.name());
            workspace.setDescription(request.description());
            workspace.setUser(user);

            return workspaceMapper.toResponse(workspaceRepository.save(workspace));
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<WorkspaceResponse> updateWorkspace(Long id, WorkspaceRequest request, String username) {
        return Mono.fromCallable(() -> {
            Workspace workspace = resolveWorkspace(id);
            verifyOwnership(workspace, username);
            workspaceMapper.updateFromRequest(workspace, request);
            return workspaceMapper.toResponse(workspaceRepository.save(workspace));
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<Void> deleteWorkspace(Long id, String username) {
        return Mono.fromRunnable(() -> {
            Workspace workspace = resolveWorkspace(id);
            verifyOwnership(workspace, username);
            workspaceRepository.delete(workspace);
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    private Flux<WorkspaceResponse> fetchWorkspaces(Supplier<List<Workspace>> query) {
        return Mono.fromCallable(query::get)
                .subscribeOn(Schedulers.boundedElastic())
                .flatMapMany(Flux::fromIterable)
                .map(workspaceMapper::toResponse);
    }

    private User resolveUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username));
    }

    private Workspace resolveWorkspace(Long id) {
        return workspaceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace no encontrado con ID: " + id));
    }

    private void verifyOwnership(Workspace workspace, String username) {
        if (workspace.getUser().getUsername().equals(username)) {
            return;
        }

        User requester = resolveUser(username);
        if (requester.getRole() != Role.ADMIN) {
            throw new AccessDeniedException("No tienes permiso para acceder a este workspace.");
        }
    }
}
