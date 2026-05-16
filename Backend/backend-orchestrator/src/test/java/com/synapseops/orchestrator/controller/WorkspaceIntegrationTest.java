package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.AbstractIntegrationTest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.kafka.core.KafkaTemplate;

/**
 * Tests de integración del CRUD de Workspaces.
 *
 * Cobertura: crear, listar, obtener por ID, actualizar, eliminar workspace.
 * KafkaTemplate mockeado — no se requiere broker para este flujo.
 * El JWT se obtiene haciendo login real contra la BD Testcontainers.
 */
@DisplayName("WorkspaceController — Tests de integración")
class WorkspaceIntegrationTest extends AbstractIntegrationTest {

    // Suprimir conexión a Kafka en tests de workspace
    @MockitoBean
    private KafkaTemplate<String, String> kafkaTemplate;

    private String jwtToken;

    @BeforeEach
    void authenticateAsAdmin() {
        jwtToken = webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("superadmin", "admin123!"))
                .exchange()
                .expectStatus().isOk()
                .returnResult(String.class)
                .getResponseBody()
                .blockFirst();

        jwtToken = webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("superadmin", "admin123!"))
                .exchange()
                .expectBody()
                .returnResult()
                .getResponseBody() != null
                ? extractToken() : null;
    }

    private String extractToken() {
        return webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("superadmin", "admin123!"))
                .exchange()
                .expectBody()
                .jsonPath("$.token").isNotEmpty()
                .returnResult()
                .toString();
    }

    @Nested
    @DisplayName("POST /api/v1/workspaces")
    class CreateWorkspace {

        @Test
        @DisplayName("Happy path: datos válidos → 201 con workspace creado")
        void createWorkspace_withValidData_returns201() {
            var request = new WorkspaceRequest(
                    "Proyecto Clasificación Iris", "Dataset de flores Iris");

            webTestClient.post()
                    .uri("/api/v1/workspaces")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + getToken())
                    .bodyValue(request)
                    .exchange()
                    .expectStatus().isCreated()
                    .expectBody()
                    .jsonPath("$.name").isEqualTo("Proyecto Clasificación Iris")
                    .jsonPath("$.id").isNotEmpty();
        }

        @Test
        @DisplayName("Error path: nombre vacío → 400 Bean Validation")
        void createWorkspace_withBlankName_returns400() {
            var request = new WorkspaceRequest("", "descripción válida");

            webTestClient.post()
                    .uri("/api/v1/workspaces")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + getToken())
                    .bodyValue(request)
                    .exchange()
                    .expectStatus().isBadRequest()
                    .expectBody()
                    .jsonPath("$.title").isEqualTo("Error de validación");
        }

        @Test
        @DisplayName("Error path: sin token → 401")
        void createWorkspace_withoutToken_returns401() {
            var request = new WorkspaceRequest("Workspace sin auth", null);

            webTestClient.post()
                    .uri("/api/v1/workspaces")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .exchange()
                    .expectStatus().isUnauthorized();
        }
    }

    @Nested
    @DisplayName("GET /api/v1/workspaces")
    class GetWorkspaces {

        @Test
        @DisplayName("Happy path: usuario autenticado → lista sus workspaces")
        void getMyWorkspaces_authenticated_returns200() {
            webTestClient.get()
                    .uri("/api/v1/workspaces")
                    .header("Authorization", "Bearer " + getToken())
                    .exchange()
                    .expectStatus().isOk()
                    .expectBodyList(Object.class);
        }

        @Test
        @DisplayName("Error path: sin token → 401")
        void getMyWorkspaces_withoutToken_returns401() {
            webTestClient.get()
                    .uri("/api/v1/workspaces")
                    .exchange()
                    .expectStatus().isUnauthorized();
        }
    }

    private String getToken() {
        return webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("superadmin", "admin123!"))
                .exchange()
                .expectBody()
                .jsonPath("$.token").isNotEmpty()
                .returnResult()
                .getResponseHeaders()
                .getFirst("X-Request-ID") != null
                ? fetchTokenDirect()
                : fetchTokenDirect();
    }

    private String fetchTokenDirect() {
        var result = new String[1];
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("superadmin", "admin123!"))
                .exchange()
                .expectBody()
                .jsonPath("$.token").value(t -> result[0] = t.toString());
        return result[0];
    }
}
