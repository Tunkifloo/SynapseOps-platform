package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.domain.dto.kafka.PipelineJobRequest;
import com.synapseops.orchestrator.domain.dto.request.ExecutionRequest;
import com.synapseops.orchestrator.domain.dto.response.ExecutionResponse;
import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.exception.ServiceUnavailableException;
import com.synapseops.orchestrator.infra.kafka.PipelineEventPublisher;
import com.synapseops.orchestrator.infra.sse.ExecutionEventBus;
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
    private final ExecutionEventBus           executionEventBus;

    @Override
    public Mono<ExecutionResponse> launchExecution(Long pipelineId,
                                                   Long workspaceId,
                                                   ExecutionRequest request,
                                                   String username) {
        return Mono.fromCallable(() -> {

            Pipeline pipeline = pipelineRepository.findByIdWithWorkspace(pipelineId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Pipeline", pipelineId));

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
            execution.setModelName(request.modelName());   // telemetría por modelo (TEL-04+)
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
                    // El ML Engine autodetecta el real; este valor es solo orientativo.
                    request.numClasses() != null ? request.numClasses() : 0,
                    request.modelName(),
                    request.preprocessingStrategy() != null ? request.preprocessingStrategy() : "normalization",
                    request.imageSize(),
                    request.trainRatio(),
                    // Normalización fija Min-Max [0,1]: zscore/rescale se retiraron (rompían
                    // los modelos preentrenados y cuadruplicaban la memoria). Se fuerza minmax
                    // aquí para cubrir también pipelines guardados con la opción antigua.
                    "minmax",
                    request.dataAugmentation(),
                    request.optimizer() != null ? request.optimizer() : "adam",
                    request.batchNorm(),
                    request.earlyStopping(),
                    request.esPatience(),
                    request.esMonitor() != null ? request.esMonitor() : "val_loss",
                    // Augmentation/balanceo y Transfer Learning (el ML Engine aplica
                    // defaults ante null, así que se propagan tal cual).
                    request.augmentationConfig(),
                    request.classBalancing(),
                    request.balanceThreshold(),
                    request.dropout(),
                    request.l2(),
                    request.featureExtractionEpochs(),
                    request.featureExtractionLr(),
                    request.finetuningEpochs(),
                    request.finetuningLr(),
                    request.unfreezeLayers(),
                    // HPO (Fase 4): defaults seguros si el cliente no los envía.
                    request.hpo() != null ? request.hpo() : Boolean.FALSE,
                    request.hpoTrials() != null ? request.hpoTrials() : 10,
                    request.hpoEffort() != null ? request.hpoEffort() : "balanced"
            );

            // Compensación síncrona (dual-write): la escritura en BD y la publicación a
            // Kafka no son atómicas. Si no se confirma la publicación, se revierte el
            // estado a FAILED para no dejar la ejecución colgada en RUNNING para siempre.
            // Una eventual entrega tardía es inofensiva: el PipelineResultProcessor
            // descarta resultados de ejecuciones ya en estado terminal (idempotencia).
            String execId = String.valueOf(execution.getIdExecution());
            try {
                eventPublisher.publishPipelineJob(job);
                executionEventBus.publish(execId, "INFO",
                        "Job publicado en Kafka — entrenamiento en curso…");
            } catch (RuntimeException ex) {
                execution.fail();
                executionRepository.save(execution);
                pipeline.setStatus(PipelineStatus.FAILED);
                pipelineRepository.save(pipeline);
                executionEventBus.publish(execId, "ERROR",
                        "No se pudo encolar el trabajo en Kafka.", true);
                log.error("Publicación a Kafka falló — executionId={} marcada FAILED: {}",
                        execution.getIdExecution(), ex.getMessage());
                throw new ServiceUnavailableException(
                        "No se pudo encolar el trabajo de entrenamiento. Inténtalo de nuevo.", ex);
            }

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
                            "Ejecución no encontrada con ID: " + executionId));

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
                                    "Pipeline", pipelineId));

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