package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.AbstractIntegrationTest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * Tests de integración del endpoint de autenticación.
 *
 * Cobertura según ADR-011:
 *  - POST /api/v1/auth/login happy path → 200 + JWT
 *  - POST /api/v1/auth/login error path → 401 credenciales inválidas
 *  - POST /api/v1/auth/login error path → 400 datos inválidos
 *
 * El contenedor PostgreSQL es el mismo de AbstractIntegrationTest (Singleton).
 * DatabaseSeeder crea el superadmin al arrancar → credenciales conocidas.
 */
@DisplayName("AuthController — Tests de integración")
class AuthIntegrationTest extends AbstractIntegrationTest {

    @Nested
    @DisplayName("POST /api/v1/auth/login")
    class Login {

        @Test
        @DisplayName("Happy path: credenciales válidas → 200 con token JWT")
        void login_withValidCredentials_returns200WithToken() {
            var request = new LoginRequest("superadmin", "admin123!");

            webTestClient.post()
                    .uri("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .exchange()
                    .expectStatus().isOk()
                    .expectBody()
                    .jsonPath("$.token").isNotEmpty()
                    .jsonPath("$.token").value(token ->
                            org.assertj.core.api.Assertions
                                    .assertThat(token.toString())
                                    .startsWith("eyJ"));
        }

        @Test
        @DisplayName("Error path: contraseña incorrecta → 401")
        void login_withWrongPassword_returns401() {
            var request = new LoginRequest("superadmin", "wrongpassword");

            webTestClient.post()
                    .uri("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .exchange()
                    .expectStatus().isUnauthorized()
                    .expectBody()
                    .jsonPath("$.title").isEqualTo("Credenciales inválidas");
        }

        @Test
        @DisplayName("Error path: usuario inexistente → 401")
        void login_withNonExistentUser_returns401() {
            var request = new LoginRequest("noexiste", "anypassword");

            webTestClient.post()
                    .uri("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .exchange()
                    .expectStatus().isUnauthorized();
        }

        @Test
        @DisplayName("Error path: username vacío → 400 Bean Validation")
        void login_withBlankUsername_returns400() {
            var request = new LoginRequest("", "admin123!");

            webTestClient.post()
                    .uri("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .exchange()
                    .expectStatus().isBadRequest()
                    .expectBody()
                    .jsonPath("$.title").isEqualTo("Error de validación");
        }

        @Test
        @DisplayName("Error path: sin body → 400")
        void login_withEmptyBody_returns400() {
            webTestClient.post()
                    .uri("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("{}")
                    .exchange()
                    .expectStatus().isBadRequest();
        }
    }
}