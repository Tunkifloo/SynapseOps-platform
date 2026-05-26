package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import com.synapseops.orchestrator.service.auth.AuthService;
import com.synapseops.orchestrator.service.WorkspaceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class BeanValidationTest {

    @LocalServerPort
    private int port;

    private WebTestClient webTestClient;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private WorkspaceService workspaceService;

    @BeforeEach
    void setUp() {
        webTestClient = WebTestClient
                .bindToServer()
                .baseUrl("http://localhost:" + port)
                .build();
    }

    // ── LoginRequest ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("TA-005 | Login con username vacío → 400")
    void login_withBlankUsername_returns400() {
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("", "validPassword123"))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Error de validación")
                .jsonPath("$.detail").value(detail ->
                        org.assertj.core.api.Assertions
                                .assertThat(detail.toString())
                                .contains("username"));
    }

    @Test
    @DisplayName("TA-005 | Login con password corta → 400")
    void login_withShortPassword_returns400() {
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new LoginRequest("admin", "123"))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Error de validación")
                .jsonPath("$.detail").value(detail ->
                        org.assertj.core.api.Assertions
                                .assertThat(detail.toString())
                                .contains("password"));
    }

    @Test
    @DisplayName("TA-005 | Login con body vacío → 400")
    void login_withEmptyBody_returns400() {
        webTestClient.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{}")
                .exchange()
                .expectStatus().isBadRequest();
    }

    // ── WorkspaceRequest ──────────────────────────────────────────────────────

    @Test
    @WithMockUser(roles = "COLLABORATOR")
    @DisplayName("TA-005 | Workspace con nombre vacío → 400")
    void createWorkspace_withBlankName_returns400() {
        webTestClient.post()
                .uri("/api/v1/workspaces")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new WorkspaceRequest("", "descripción válida"))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Error de validación")
                .jsonPath("$.detail").value(detail ->
                        org.assertj.core.api.Assertions
                                .assertThat(detail.toString())
                                .contains("name"));
    }

    @Test
    @WithMockUser(roles = "COLLABORATOR")
    @DisplayName("TA-005 | Workspace con descripción > 1000 chars → 400")
    void createWorkspace_withTooLongDescription_returns400() {
        webTestClient.post()
                .uri("/api/v1/workspaces")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new WorkspaceRequest("Proyecto válido", "x".repeat(1001)))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.detail").value(detail ->
                        org.assertj.core.api.Assertions
                                .assertThat(detail.toString())
                                .contains("description"));
    }

    @Test
    @WithMockUser(roles = "COLLABORATOR")
    @DisplayName("TA-005 | Workspace con datos válidos → pasa validación")
    void createWorkspace_withValidData_passesValidation() {
        webTestClient.post()
                .uri("/api/v1/workspaces")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new WorkspaceRequest("Mi Proyecto", "Descripción opcional"))
                .exchange()
                .expectStatus().value(status ->
                        org.assertj.core.api.Assertions
                                .assertThat(status)
                                .isNotEqualTo(400));
    }
}
