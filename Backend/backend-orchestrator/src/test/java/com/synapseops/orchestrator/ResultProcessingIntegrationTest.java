package com.synapseops.orchestrator;

import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.kafka.PipelineResultProcessor;
import com.synapseops.orchestrator.infra.repository.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Test de integración del lado consumidor del flujo Kafka: simula la recepción de
 * un resultado del ml-engine invocando el {@link PipelineResultProcessor} con una
 * BD PostgreSQL real (Testcontainers), verificando la persistencia E2E y la
 * idempotencia ante redelivery. No requiere un broker Kafka real.
 */
@DisplayName("Flujo de resultados (consumer → BD) — Integración")
class ResultProcessingIntegrationTest extends AbstractIntegrationTest {

    @MockitoBean
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired PipelineResultProcessor processor;
    @Autowired UserRepository userRepository;
    @Autowired WorkspaceRepository workspaceRepository;
    @Autowired PipelineRepository pipelineRepository;
    @Autowired PipelineExecutionRepository executionRepository;
    @Autowired MLArtifactRepository artifactRepository;

    private PipelineExecution seedRunningExecution(String suffix) {
        User admin = userRepository.findByUsername("superadmin").orElseThrow();

        Workspace ws = new Workspace();
        ws.setName("WS Result " + suffix);
        ws.setDescription("seed");
        ws.setUser(admin);
        ws.setDatasetPath("keras://mnist");
        workspaceRepository.save(ws);

        Pipeline p = new Pipeline();
        p.setName("Pipeline Result " + suffix);
        p.setStatus(PipelineStatus.RUNNING);
        p.setWorkspace(ws);
        pipelineRepository.save(p);

        PipelineExecution e = new PipelineExecution();
        e.setPipeline(p);
        e.start();   // → RUNNING
        return executionRepository.save(e);
    }

    @Test
    @DisplayName("Resultado SUCCESS → ejecución COMPLETED + artefacto persistido + pipeline COMPLETED")
    void successResult_persistsArtifactAndCompletes() {
        String suffix = "ok-" + System.nanoTime();
        PipelineExecution exec = seedRunningExecution(suffix);
        String runId = "run-" + suffix;

        String msg = """
                {"execution_id":"%d","status":"SUCCESS","run_id":"%s",
                 "model_version":"1","artifact_path":"/storage/model.keras",
                 "hyperparameters":{"epochs":5},"metrics":{"final_accuracy":0.91}}"""
                .formatted(exec.getIdExecution(), runId);

        processor.process(msg);

        PipelineExecution reloaded = executionRepository.findById(exec.getIdExecution()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ExecutionStatus.COMPLETED);
        assertThat(reloaded.getMlflowRunId()).isEqualTo(runId);
        assertThat(artifactRepository.findByRunId(runId)).isPresent();
    }

    @Test
    @DisplayName("Idempotencia: reprocesar el mismo resultado no duplica el artefacto")
    void duplicateResult_isIdempotent() {
        String suffix = "idem-" + System.nanoTime();
        PipelineExecution exec = seedRunningExecution(suffix);
        String runId = "run-" + suffix;

        String msg = """
                {"execution_id":"%d","status":"SUCCESS","run_id":"%s",
                 "model_version":"1","artifact_path":"/p","metrics":{}}"""
                .formatted(exec.getIdExecution(), runId);

        processor.process(msg);
        // Redelivery: la ejecución ya está en estado terminal → se ignora sin error.
        processor.process(msg);

        assertThat(artifactRepository.findByRunId(runId)).isPresent();
        assertThat(executionRepository.findById(exec.getIdExecution()).orElseThrow()
                .getStatus()).isEqualTo(ExecutionStatus.COMPLETED);
    }

    @Test
    @DisplayName("Resultado FAILED → ejecución y pipeline en FAILED, sin artefacto")
    void failedResult_marksFailed() {
        String suffix = "fail-" + System.nanoTime();
        PipelineExecution exec = seedRunningExecution(suffix);

        String msg = """
                {"execution_id":"%d","status":"FAILED","error":"OOM durante entrenamiento"}"""
                .formatted(exec.getIdExecution());

        processor.process(msg);

        assertThat(executionRepository.findById(exec.getIdExecution()).orElseThrow()
                .getStatus()).isEqualTo(ExecutionStatus.FAILED);
    }
}
