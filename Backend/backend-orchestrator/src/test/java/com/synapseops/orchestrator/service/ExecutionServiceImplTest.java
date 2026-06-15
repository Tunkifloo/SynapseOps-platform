package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.ExecutionRequest;
import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.exception.ServiceUnavailableException;
import com.synapseops.orchestrator.infra.kafka.PipelineEventPublisher;
import com.synapseops.orchestrator.infra.repository.PipelineExecutionRepository;
import com.synapseops.orchestrator.infra.repository.PipelineRepository;
import com.synapseops.orchestrator.infra.sse.ExecutionEventBus;
import com.synapseops.orchestrator.service.impl.ExecutionServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import reactor.test.StepVerifier;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("ExecutionServiceImpl — Tests unitarios")
class ExecutionServiceImplTest {

    @Mock PipelineRepository pipelineRepository;
    @Mock PipelineExecutionRepository executionRepository;
    @Mock PipelineEventPublisher eventPublisher;
    @Mock ExecutionEventBus executionEventBus;

    @InjectMocks ExecutionServiceImpl executionService;

    private Workspace workspace;
    private Pipeline pipeline;

    private ExecutionRequest request() {
        return new ExecutionRequest("tensorflow", "cnn", 5, 32, 0.001, 10, "mnist_demo",
                null, null, null, null, null, null, null, null, null, null,
                // augmentation/balanceo + transfer learning (no usados en este test)
                null, null, null, null, null, null, null, null, null, null);
    }

    @BeforeEach
    void setUp() {
        User owner = new Admin();
        owner.setIdUser(1L);
        owner.setUsername("student_one");

        workspace = new Workspace();
        workspace.setIdWorkspace(10L);
        workspace.setUser(owner);
        workspace.setDatasetPath("keras://mnist");

        pipeline = new Pipeline();
        pipeline.setIdPipeline(100L);
        pipeline.setStatus(PipelineStatus.DRAFT);
        pipeline.setWorkspace(workspace);
    }

    @Test
    @DisplayName("Happy path: crea ejecución RUNNING y publica el job en Kafka")
    void shouldLaunchExecution() {
        when(pipelineRepository.findByIdWithWorkspace(100L)).thenReturn(Optional.of(pipeline));
        when(executionRepository.save(any(PipelineExecution.class))).thenAnswer(inv -> inv.getArgument(0));
        when(pipelineRepository.save(any(Pipeline.class))).thenAnswer(inv -> inv.getArgument(0));

        StepVerifier.create(executionService.launchExecution(100L, 10L, request(), "student_one"))
                .expectNextMatches(r -> r.status() == ExecutionStatus.RUNNING)
                .verifyComplete();

        verify(eventPublisher).publishPipelineJob(any());
    }

    @Test
    @DisplayName("Workspace sin dataset → IllegalStateException, no publica")
    void shouldFailWhenNoDataset() {
        workspace.setDatasetPath(null);
        when(pipelineRepository.findByIdWithWorkspace(100L)).thenReturn(Optional.of(pipeline));

        StepVerifier.create(executionService.launchExecution(100L, 10L, request(), "student_one"))
                .expectError(IllegalStateException.class)
                .verify();

        verify(eventPublisher, never()).publishPipelineJob(any());
    }

    @Test
    @DisplayName("Usuario distinto al dueño → AccessDeniedException")
    void shouldFailWhenNotOwner() {
        when(pipelineRepository.findByIdWithWorkspace(100L)).thenReturn(Optional.of(pipeline));

        StepVerifier.create(executionService.launchExecution(100L, 10L, request(), "intruso"))
                .expectError(AccessDeniedException.class)
                .verify();
    }

    @Test
    @DisplayName("Pipeline inexistente → ResourceNotFoundException")
    void shouldFailWhenPipelineNotFound() {
        when(pipelineRepository.findByIdWithWorkspace(100L)).thenReturn(Optional.empty());

        StepVerifier.create(executionService.launchExecution(100L, 10L, request(), "student_one"))
                .expectError(ResourceNotFoundException.class)
                .verify();
    }

    @Test
    @DisplayName("Fallo de publicación → compensa (FAILED) y emite ServiceUnavailableException")
    void shouldCompensateWhenPublishFails() {
        when(pipelineRepository.findByIdWithWorkspace(100L)).thenReturn(Optional.of(pipeline));
        when(executionRepository.save(any(PipelineExecution.class))).thenAnswer(inv -> inv.getArgument(0));
        when(pipelineRepository.save(any(Pipeline.class))).thenAnswer(inv -> inv.getArgument(0));
        doThrow(new IllegalStateException("broker caído"))
                .when(eventPublisher).publishPipelineJob(any());

        StepVerifier.create(executionService.launchExecution(100L, 10L, request(), "student_one"))
                .expectError(ServiceUnavailableException.class)
                .verify();

        // La ejecución se persistió en FAILED (compensación) y el pipeline también.
        verify(executionRepository, atLeastOnce()).save(argThat(
                e -> e.getStatus() == ExecutionStatus.FAILED));
        verify(pipelineRepository, atLeastOnce()).save(argThat(
                p -> p.getStatus() == PipelineStatus.FAILED));
    }
}
