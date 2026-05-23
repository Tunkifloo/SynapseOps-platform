package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.domain.dto.kafka.PipelineJobRequest;
import com.synapseops.orchestrator.domain.dto.request.ExecutionRequest;
import com.synapseops.orchestrator.domain.dto.response.ExecutionResponse;
import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.kafka.PipelineEventPublisher;
import com.synapseops.orchestrator.infra.repository.*;
import com.synapseops.orchestrator.service.ExecutionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExecutionServiceImpl implements ExecutionService {

    private final PipelineRepository          pipelineRepository;
    private final PipelineExecutionRepository executionRepository;
    private final PipelineEventPublisher      eventPublisher;

    @Override
    public Mono<ExecutionResponse> launchExecution(Long pipelineId,
                                                   Long workspaceId,
                                                   ExecutionRequest request,
                                                   String username) {
        return Mono.fromCallable(() -> {

            Pipeline pipeline = pipelineRepository.findByIdWithWorkspace(pipelineId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Pipeline no encontrado: " + pipelineId));

            Workspace workspace = pipeline.getWorkspace();

            if (!workspace.getUser().getUsername().equals(username)) {
                throw new AccessDeniedException("Sin permisos sobre este pipeline.");
            }
            if (!workspace.getIdWorkspace().equals(workspaceId)) {
                throw new AccessDeniedException(
                        "El pipeline no pertenece al workspace indicado.");
            }

            String datasetPath = workspace.getDatasetPath();
            if (datasetPath == null || datasetPath.isBlank()) {
                throw new IllegalStateException(
                        "El workspace no tiene dataset asignado. Sube un dataset primero.");
            }

            PipelineExecution execution = new PipelineExecution();
            execution.setPipeline(pipeline);
            execution.start();
            executionRepository.save(execution);

            pipeline.setStatus(PipelineStatus.RUNNING);
            pipelineRepository.save(pipeline);

            PipelineJobRequest job = new PipelineJobRequest(
                    String.valueOf(execution.getIdExecution()),
                    String.valueOf(pipelineId),
                    String.valueOf(workspace.getIdWorkspace()),
                    datasetPath,
                    request.framework(),
                    request.architecture(),
                    request.epochs(),
                    request.batchSize(),
                    request.learningRate(),
                    request.numClasses(),
                    request.modelName(),
                    "normalization"
            );
            eventPublisher.publishPipelineJob(job);

            log.info("Ejecución lanzada — executionId={} pipeline={} dataset={}",
                    execution.getIdExecution(), pipelineId, datasetPath);

            return new ExecutionResponse(
                    execution.getIdExecution(),
                    execution.getStatus(),
                    execution.getStartedAt(),
                    execution.getFinishedAt(),
                    null,
                    pipelineId,
                    null,
                    null,
                    null
            );

        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<ExecutionResponse> getExecution(Long executionId, String username) {
        return Mono.fromCallable(() -> {
            PipelineExecution exec = executionRepository
                    .findByIdWithDetails(executionId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Ejecución no encontrada: " + executionId));

            if (!exec.getPipeline().getWorkspace().getUser()
                    .getUsername().equals(username)) {
                throw new AccessDeniedException("Sin permisos sobre esta ejecución.");
            }
            return toResponse(exec);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Flux<ExecutionResponse> getExecutionsByPipeline(Long pipelineId,
                                                           String username) {
        return Mono.fromCallable(() -> {
                    Pipeline pipeline = pipelineRepository.findById(pipelineId)
                            .orElseThrow(() -> new ResourceNotFoundException(
                                    "Pipeline no encontrado: " + pipelineId));

                    if (!pipeline.getWorkspace().getUser().getUsername().equals(username)) {
                        throw new AccessDeniedException("Sin permisos.");
                    }
                    return executionRepository
                            .findByPipelineIdWithDetails(pipelineId);
                }).subscribeOn(Schedulers.boundedElastic())
                .flatMapMany(Flux::fromIterable)
                .map(this::toResponse);
    }

    private ExecutionResponse toResponse(PipelineExecution exec) {
        MLArtifact artifact = exec.getArtifact();
        return new ExecutionResponse(
                exec.getIdExecution(),
                exec.getStatus(),
                exec.getStartedAt(),
                exec.getFinishedAt(),
                exec.getMlflowRunId(),
                exec.getPipeline() != null ? exec.getPipeline().getIdPipeline() : null,
                artifact != null ? artifact.getModelVersion()   : null,
                artifact != null ? artifact.getArtifactPath()   : null,
                artifact != null ? artifact.getMetrics()        : null
        );
    }
}