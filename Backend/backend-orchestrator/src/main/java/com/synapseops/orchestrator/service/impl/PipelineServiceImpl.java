package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.domain.dto.request.PipelineRequest;
import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import com.synapseops.orchestrator.domain.entity.Pipeline;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.domain.entity.Workspace;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.PipelineRepository;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.mapper.PipelineMapper;
import com.synapseops.orchestrator.service.PipelineService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.List;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class PipelineServiceImpl implements PipelineService {

    private final PipelineRepository  pipelineRepository;
    private final WorkspaceRepository workspaceRepository;
    private final UserRepository userRepository;
    private final PipelineMapper      pipelineMapper;
    private final JdbcTemplate        jdbcTemplate;

    @Override
    public Flux<PipelineResponse> getPipelinesByWorkspace(
            Long workspaceId, String username) {
        return fetchPipelines(() -> {
            Workspace workspace = resolveWorkspace(workspaceId);
            verifyAccess(workspace, username);
            return pipelineRepository.findByWorkspace_IdWorkspace(workspaceId);
        });
    }

    @Override
    public Mono<PipelineResponse> getPipelineById(
            Long id, Long workspaceId, String username) {
        return Mono.fromCallable(() -> {
            Pipeline pipeline = resolvePipeline(id);
            verifyAccess(pipeline.getWorkspace(), username);
            verifyBelongsToWorkspace(pipeline, workspaceId);
            return pipelineMapper.toResponse(pipeline);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<PipelineResponse> createPipeline(
            Long workspaceId, PipelineRequest request, String username) {
        return Mono.fromCallable(() -> {
            Workspace workspace = resolveWorkspace(workspaceId);
            verifyOwnership(workspace, username);

            Pipeline pipeline = new Pipeline();
            pipeline.setName(request.name());
            pipeline.setWorkspace(workspace);

            Pipeline saved = pipelineRepository.save(pipeline);

            return pipelineRepository.findByIdWithWorkspace(saved.getIdPipeline())
                    .map(pipelineMapper::toResponse)
                    .orElseGet(() -> pipelineMapper.toResponse(saved));

        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<PipelineResponse> renamePipeline(
            Long id, Long workspaceId, PipelineRequest request, String username) {
        return Mono.fromCallable(() -> {
            Pipeline pipeline = resolvePipeline(id);
            verifyOwnership(pipeline.getWorkspace(), username);
            verifyBelongsToWorkspace(pipeline, workspaceId);
            pipeline.setName(request.name());
            return pipelineMapper.toResponse(pipelineRepository.save(pipeline));
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<Void> deletePipeline(Long id, Long workspaceId, String username) {
        return Mono.fromCallable(() -> {
            Pipeline pipeline = resolvePipeline(id);
            verifyOwnership(pipeline.getWorkspace(), username);
            verifyBelongsToWorkspace(pipeline, workspaceId);
            jdbcTemplate.update("DELETE FROM pipelines WHERE id_pipeline = ?",
                    pipeline.getIdPipeline());
            return true;
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    private Flux<PipelineResponse> fetchPipelines(Supplier<List<Pipeline>> query) {
        return Mono.fromCallable(() -> query.get().stream()
                        .map(pipelineMapper::toResponse)
                        .toList())
                .subscribeOn(Schedulers.boundedElastic())
                .flatMapMany(Flux::fromIterable);
    }

    private Workspace resolveWorkspace(Long id) {
        return workspaceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Workspace no encontrado con ID: " + id));
    }

    private Pipeline resolvePipeline(Long id) {
        return pipelineRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Pipeline no encontrado con ID: " + id));
    }

    private void verifyOwnership(Workspace workspace, String username) {
        if (!workspace.getUser().getUsername().equals(username)) {
            throw new AccessDeniedException(
                    "No tienes permiso para acceder a este recurso.");
        }
    }

    private void verifyAccess(Workspace workspace, String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username));
        if (user.getRole() == Role.ADMIN) return;
        if (!workspace.getUser().getUsername().equals(username)) {
            throw new AccessDeniedException("No tienes permiso para acceder a este recurso.");
        }
    }

    private void verifyBelongsToWorkspace(Pipeline pipeline, Long workspaceId) {
        if (!pipeline.getWorkspace().getIdWorkspace().equals(workspaceId)) {
            throw new AccessDeniedException(
                    "El pipeline no pertenece al workspace indicado.");
        }
    }
}
