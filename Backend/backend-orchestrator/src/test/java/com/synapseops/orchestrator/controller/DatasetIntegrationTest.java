package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.AbstractIntegrationTest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;

/**
 * Tests de integración del registro/asignación de datasets a un workspace.
 * Cubre la vía 'kerasDataset' y validaciones (sin requerir subir archivos reales).
 */
@DisplayName("DatasetController — Tests de integración")
class DatasetIntegrationTest extends AbstractIntegrationTest {

    @MockitoBean
    private KafkaTemplate<String, String> kafkaTemplate;

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
                .bodyValue(new WorkspaceRequest(name, "ws dataset"))
                .exchange().expectStatus().isCreated()
                .expectBody().jsonPath("$.idWorkspace").value(v -> id[0] = Long.valueOf(v.toString()));
        return id[0];
    }

    @Test
    @DisplayName("Registrar dataset keras 'mnist' → 200")
    void registerKerasMnist_returns200() {
        var token = adminToken();
        long wsId = createWorkspace(token, "WS DS Mnist");

        webTestClient.post().uri("/api/v1/workspaces/{id}/dataset/url", wsId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("kerasDataset", "mnist"))
                .exchange()
                .expectStatus().isOk();
    }

    @Test
    @DisplayName("Dataset keras no soportado (cifar10) → 400")
    void registerUnsupportedKeras_returns400() {
        var token = adminToken();
        long wsId = createWorkspace(token, "WS DS Cifar");

        webTestClient.post().uri("/api/v1/workspaces/{id}/dataset/url", wsId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("kerasDataset", "cifar10"))
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    @DisplayName("Sin 'url' ni 'kerasDataset' → 400")
    void registerWithoutPayload_returns400() {
        var token = adminToken();
        long wsId = createWorkspace(token, "WS DS Vacio");

        webTestClient.post().uri("/api/v1/workspaces/{id}/dataset/url", wsId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of())
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    @DisplayName("Sin token → 401")
    void registerWithoutToken_returns401() {
        webTestClient.post().uri("/api/v1/workspaces/1/dataset/url")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("kerasDataset", "mnist"))
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    @DisplayName("Workspace inexistente → 404")
    void registerOnMissingWorkspace_returns404() {
        var token = adminToken();

        webTestClient.post().uri("/api/v1/workspaces/{id}/dataset/url", 999999L)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("kerasDataset", "mnist"))
                .exchange()
                .expectStatus().isNotFound();
    }
}
