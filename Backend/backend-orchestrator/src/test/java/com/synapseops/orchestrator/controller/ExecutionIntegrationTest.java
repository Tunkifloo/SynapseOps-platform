package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.AbstractIntegrationTest;
import com.synapseops.orchestrator.domain.dto.request.ExecutionRequest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.PipelineRequest;
import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Tests de integración del lanzamiento de ejecuciones.
 * El KafkaTemplate se simula para confirmar el ACK sin un broker real.
 */
@DisplayName("ExecutionController — Tests de integración")
class ExecutionIntegrationTest extends AbstractIntegrationTest {

    @MockitoBean
    private KafkaTemplate<String, String> kafkaTemplate;

    private void stubKafkaAck() {
        var record = new ProducerRecord<String, String>("mlops.pipeline.requests", "k", "v");
        var metadata = new RecordMetadata(
                new TopicPartition("mlops.pipeline.requests", 0), 0L, 0, 0L, 0, 0);
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(new SendResult<>(record, metadata)));
    }

    private String adminToken() {
        var token = new String[1];
        webTestClient.post().uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("superadmin", "admin123!"))
                .exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.token").value(t -> token[0] = t.toString());
        return token[0];
    }

    private long createWorkspace(String token, String name) {
        var id = new Long[1];
        webTestClient.post().uri("/api/v1/workspaces")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new WorkspaceRequest(name, "ws ejecución"))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.idWorkspace").value(v -> id[0] = Long.valueOf(v.toString()));
        return id[0];
    }

    private void setKerasDataset(String token, long wsId) {
        webTestClient.post().uri("/api/v1/workspaces/{id}/dataset/url", wsId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("kerasDataset", "mnist"))
                .exchange().expectStatus().isOk();
    }

    private long createPipeline(String token, long wsId, String name) {
        var id = new Long[1];
        webTestClient.post().uri("/api/v1/workspaces/{wsId}/pipelines", wsId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new PipelineRequest(name))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.idPipeline").value(v -> id[0] = Long.valueOf(v.toString()));
        return id[0];
    }

    private ExecutionRequest validRequest() {
        return new ExecutionRequest("tensorflow", "cnn", 5, 32, 0.001, 10, "mnist_demo",
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null);   // hpo, hpoTrials, hpoEffort
    }

    @Test
    @DisplayName("Happy path: workspace con dataset + pipeline → 202 ACCEPTED")
    void execute_withDataset_returns202() {
        stubKafkaAck();
        var token = adminToken();
        long wsId = createWorkspace(token, "WS Exec OK");
        setKerasDataset(token, wsId);
        long pId = createPipeline(token, wsId, "Pipeline Exec");

        webTestClient.post()
                .uri("/api/v1/workspaces/{wsId}/pipelines/{pId}/execute", wsId, pId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validRequest())
                .exchange()
                .expectStatus().isAccepted();
    }

    @Test
    @DisplayName("Sin dataset asignado → 400")
    void execute_withoutDataset_returns400() {
        var token = adminToken();
        long wsId = createWorkspace(token, "WS Exec SinDataset");
        long pId = createPipeline(token, wsId, "Pipeline SinDataset");

        webTestClient.post()
                .uri("/api/v1/workspaces/{wsId}/pipelines/{pId}/execute", wsId, pId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validRequest())
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    @DisplayName("Pipeline inexistente → 404")
    void execute_nonExistentPipeline_returns404() {
        var token = adminToken();
        long wsId = createWorkspace(token, "WS Exec 404");

        webTestClient.post()
                .uri("/api/v1/workspaces/{wsId}/pipelines/{pId}/execute", wsId, 999999L)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validRequest())
                .exchange()
                .expectStatus().isNotFound();
    }

    @Test
    @DisplayName("Sin token → 401")
    void execute_withoutToken_returns401() {
        webTestClient.post()
                .uri("/api/v1/workspaces/1/pipelines/1/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(validRequest())
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @DisplayName("Body inválido (epochs fuera de rango) → 400")
    void execute_invalidBody_returns400() {
        var token = adminToken();
        long wsId = createWorkspace(token, "WS Exec Inval");
        long pId = createPipeline(token, wsId, "Pipeline Inval");

        var invalid = new ExecutionRequest("tensorflow", "cnn", 0, 32, 0.001, 10, "m",
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null);   // hpo, hpoTrials, hpoEffort

        webTestClient.post()
                .uri("/api/v1/workspaces/{wsId}/pipelines/{pId}/execute", wsId, pId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(invalid)
                .exchange()
                .expectStatus().isBadRequest();
    }
}
