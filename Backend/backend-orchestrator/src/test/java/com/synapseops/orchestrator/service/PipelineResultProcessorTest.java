package com.synapseops.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.kafka.PipelineResultProcessor;
import com.synapseops.orchestrator.infra.repository.MLArtifactRepository;
import com.synapseops.orchestrator.infra.repository.PipelineExecutionRepository;
import com.synapseops.orchestrator.infra.repository.PipelineRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("PipelineResultProcessor — Tests unitarios")
class PipelineResultProcessorTest {

    @Mock PipelineExecutionRepository executionRepository;
    @Mock PipelineRepository pipelineRepository;
    @Mock MLArtifactRepository artifactRepository;

    PipelineResultProcessor processor;

    private PipelineExecution execution;
    private Pipeline pipeline;

    private static final String SUCCESS_MSG = """
            {"execution_id":"42","status":"SUCCESS","run_id":"run-abc",
             "model_version":"1","artifact_path":"/storage/model.keras",
             "hyperparameters":{"epochs":5},"metrics":{"final_accuracy":0.91}}""";

    @BeforeEach
    void setUp() {
        processor = new PipelineResultProcessor(
                executionRepository, pipelineRepository, artifactRepository, new ObjectMapper());

        pipeline = new Pipeline();
        pipeline.setIdPipeline(100L);
        pipeline.setStatus(PipelineStatus.RUNNING);

        execution = new PipelineExecution();
        execution.setIdExecution(42L);
        execution.setStatus(ExecutionStatus.RUNNING);
        execution.setPipeline(pipeline);
    }

    @Test
    @DisplayName("SUCCESS → completa ejecución, persiste artefacto y marca pipeline COMPLETED")
    void shouldPersistArtifactOnSuccess() {
        when(executionRepository.findByIdWithDetails(42L)).thenReturn(Optional.of(execution));
        when(artifactRepository.findByRunId("run-abc")).thenReturn(Optional.empty());

        processor.process(SUCCESS_MSG);

        verify(executionRepository).save(argThat(e -> e.getStatus() == ExecutionStatus.COMPLETED));
        verify(artifactRepository).save(argThat(a -> "run-abc".equals(a.getRunId())));
        verify(pipelineRepository).save(argThat(p -> p.getStatus() == PipelineStatus.COMPLETED));
    }

    @Test
    @DisplayName("Idempotencia: ejecución ya terminal → ignora (no persiste)")
    void shouldIgnoreWhenExecutionAlreadyTerminal() {
        execution.setStatus(ExecutionStatus.COMPLETED);
        when(executionRepository.findByIdWithDetails(42L)).thenReturn(Optional.of(execution));

        processor.process(SUCCESS_MSG);

        verify(executionRepository, never()).save(any());
        verify(artifactRepository, never()).save(any());
        verify(pipelineRepository, never()).save(any());
    }

    @Test
    @DisplayName("Dedup: run_id ya persistido → no inserta artefacto duplicado")
    void shouldNotDuplicateArtifact() {
        when(executionRepository.findByIdWithDetails(42L)).thenReturn(Optional.of(execution));
        when(artifactRepository.findByRunId("run-abc"))
                .thenReturn(Optional.of(new MLArtifact()));

        processor.process(SUCCESS_MSG);

        verify(artifactRepository, never()).save(any());
        verify(executionRepository).save(argThat(e -> e.getStatus() == ExecutionStatus.COMPLETED));
    }

    @Test
    @DisplayName("FAILED → marca ejecución y pipeline como FAILED")
    void shouldMarkFailed() {
        when(executionRepository.findByIdWithDetails(42L)).thenReturn(Optional.of(execution));

        processor.process("{\"execution_id\":\"42\",\"status\":\"FAILED\",\"error\":\"OOM\"}");

        verify(executionRepository).save(argThat(e -> e.getStatus() == ExecutionStatus.FAILED));
        verify(pipelineRepository).save(argThat(p -> p.getStatus() == PipelineStatus.FAILED));
        verify(artifactRepository, never()).save(any());
    }

    @Test
    @DisplayName("Ejecución inexistente → no lanza ni persiste")
    void shouldReturnWhenExecutionNotFound() {
        when(executionRepository.findByIdWithDetails(42L)).thenReturn(Optional.empty());

        processor.process(SUCCESS_MSG);

        verify(executionRepository, never()).save(any());
    }
}
