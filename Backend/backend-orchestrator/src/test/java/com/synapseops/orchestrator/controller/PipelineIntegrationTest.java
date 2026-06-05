package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.AbstractIntegrationTest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.PipelineRequest;
import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Tests de integración del CRUD de Pipelines (anidado bajo Workspace).
 * Mockea KafkaTemplate para no requerir un broker real (perfil test).
 */
@DisplayName("PipelineController — Tests de integración")
class PipelineIntegrationTest extends AbstractIntegrationTest {

    @MockitoBean
    private KafkaTemplate<String, String> kafkaTemplate;

    private String adminToken() {
        var token = new String[1];
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("superadmin", "admin123!"))
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.token").value(t -> token[0] = t.toString());
        return token[0];
    }

    private long createWorkspace(String token, String name) {
        var id = new Long[1];
        webTestClient.post()
                .uri("/api/v1/workspaces")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new WorkspaceRequest(name, "ws para pipelines"))
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.idWorkspace").value(v ->
                        id[0] = Long.valueOf(v.toString()));
        return id[0];
    }

    @Nested
    @DisplayName("CRUD de pipelines")
    class Crud {

        @Test
        @DisplayName("Crear pipeline en workspace propio → 201")
        void createPipeline_returns201() {
            var token = adminToken();
            long wsId = createWorkspace(token, "WS Pipelines Create");

            webTestClient.post()
                    .uri("/api/v1/workspaces/{wsId}/pipelines", wsId)
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(new PipelineRequest("Pipeline E2E"))
                    .exchange()
                    .expectStatus().isCreated();
        }

        @Test
        @DisplayName("Listar pipelines del workspace → 200")
        void listPipelines_returns200() {
            var token = adminToken();
            long wsId = createWorkspace(token, "WS Pipelines List");

            webTestClient.get()
                    .uri("/api/v1/workspaces/{wsId}/pipelines", wsId)
                    .header("Authorization", "Bearer " + token)
                    .exchange()
                    .expectStatus().isOk()
                    .expectBodyList(Object.class);
        }

        @Test
        @DisplayName("Crear pipeline sin token → 401")
        void createPipeline_withoutToken_returns401() {
            webTestClient.post()
                    .uri("/api/v1/workspaces/1/pipelines")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(new PipelineRequest("Sin auth"))
                    .exchange()
                    .expectStatus().isUnauthorized();
        }

        @Test
        @DisplayName("Crear pipeline con nombre vacío → 400")
        void createPipeline_blankName_returns400() {
            var token = adminToken();
            long wsId = createWorkspace(token, "WS Pipelines Val");

            webTestClient.post()
                    .uri("/api/v1/workspaces/{wsId}/pipelines", wsId)
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(new PipelineRequest(""))
                    .exchange()
                    .expectStatus().isBadRequest();
        }
    }
}
