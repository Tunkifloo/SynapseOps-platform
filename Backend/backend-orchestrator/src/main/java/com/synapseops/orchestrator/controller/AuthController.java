package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.ForgotPasswordRequest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.UserRegistrationRequest;
import com.synapseops.orchestrator.domain.dto.response.TokenResponse;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.service.auth.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Autenticación", description = "Login, logout y gestión de credenciales")
public class AuthController {

    private final AuthService authService;

    @Operation(summary = "Iniciar sesión",
            description = "Autentica al usuario y retorna un token JWT")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Login exitoso — retorna JWT"),
            @ApiResponse(responseCode = "400", description = "Datos de entrada inválidos"),
            @ApiResponse(responseCode = "401", description = "Credenciales incorrectas")
    })
    @PostMapping("/login")
    public Mono<ResponseEntity<TokenResponse>> login(
            @Valid @RequestBody LoginRequest request) {
        return authService.login(request).map(ResponseEntity::ok);
    }

    @Operation(summary = "Restablecer contraseña")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Contraseña restablecida"),
            @ApiResponse(responseCode = "400", description = "Email inválido o usuario no existe")
    })
    @PostMapping("/forgot-password")
    public Mono<ResponseEntity<String>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request) {
        return authService.forgotPassword(request)
                .thenReturn(ResponseEntity.ok("Contraseña restablecida con éxito."));
    }

    @Operation(summary = "Registrar nuevo colaborador",
            description = "Solo ADMIN. Crea una cuenta de estudiante/colaborador")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Usuario creado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos"),
            @ApiResponse(responseCode = "403", description = "Solo ADMIN"),
            @ApiResponse(responseCode = "409", description = "Username o correo ya en uso")
    })
    @PostMapping("/register")
    @PreAuthorize("hasRole('ADMIN')")
    @SecurityRequirement(name = "bearerAuth")
    public Mono<ResponseEntity<UserResponse>> register(
            @Valid @RequestBody UserRegistrationRequest request) {
        return authService.register(request)
                .map(user -> ResponseEntity.status(HttpStatus.CREATED).body(user));
    }

    @Operation(summary = "Cerrar sesión",
            description = "Invalida el token JWT en el cliente")
    @ApiResponse(responseCode = "200", description = "Sesión cerrada")
    @PostMapping("/logout")
    @SecurityRequirement(name = "bearerAuth")
    public Mono<ResponseEntity<Map<String, String>>> logout(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
            String authHeader) {
        return authService.logout(authHeader)
                .thenReturn(ResponseEntity.ok(
                        Map.of("message", "Sesión cerrada correctamente.")));
    }
}