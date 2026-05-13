package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.PasswordUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserProfileUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserUpdateRequest;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "Usuarios", description = "Gestión de cuentas — admin y perfil propio")
@SecurityRequirement(name = "bearerAuth")
public class UserController {

    private final UserService userService;

    @Operation(summary = "Listar todos los usuarios (Admin)")
    @ApiResponse(responseCode = "200", description = "Lista completa de usuarios")
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<UserResponse> getAllUsers() {
        return userService.getAllUsers();
    }

    @Operation(summary = "Listar usuarios por rol (Admin)")
    @GetMapping("/role/{role}")
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<UserResponse> getUsersByRole(@PathVariable Role role) {
        return userService.getUsersByRole(role);
    }

    @Operation(summary = "Obtener usuario por ID (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Usuario encontrado"),
            @ApiResponse(responseCode = "404", description = "No existe")
    })
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<UserResponse>> getUserById(@PathVariable Long id) {
        return userService.getUserById(id).map(ResponseEntity::ok);
    }

    @Operation(summary = "Listar usuarios deshabilitados (Admin)")
    @GetMapping("/disabled")
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<UserResponse> getDisabledUsers() {
        return userService.getDisabledUsers();
    }

    @Operation(summary = "Actualizar usuario (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Actualizado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos")
    })
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<UserResponse>> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody UserUpdateRequest request) {
        return userService.updateUserByAdmin(id, request).map(ResponseEntity::ok);
    }

    @Operation(summary = "Activar/desactivar usuario (Admin)")
    @ApiResponse(responseCode = "200", description = "Estado actualizado")
    @PatchMapping("/{id}/toggle-status")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<String>> toggleUserStatus(@PathVariable Long id) {
        return userService.toggleUserStatus(id)
                .thenReturn(ResponseEntity.ok(
                        "Estado del usuario actualizado correctamente."));
    }

    @Operation(summary = "Ver mi perfil")
    @ApiResponse(responseCode = "200", description = "Perfil del usuario autenticado")
    @GetMapping("/me")
    public Mono<ResponseEntity<UserResponse>> getMyProfile(Mono<Principal> principal) {
        return principal.flatMap(p -> userService.getProfile(p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Actualizar mi perfil")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Perfil actualizado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos")
    })
    @PutMapping("/me")
    public Mono<ResponseEntity<UserResponse>> updateMyProfile(
            Mono<Principal> principal,
            @Valid @RequestBody UserProfileUpdateRequest request) {
        return principal.flatMap(p ->
                        userService.updateMyProfile(p.getName(), request))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Cambiar mi contraseña")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Contraseña actualizada"),
            @ApiResponse(responseCode = "400", description = "Contraseña actual incorrecta")
    })
    @PatchMapping("/me/password")
    public Mono<ResponseEntity<String>> updateMyPassword(
            Mono<Principal> principal,
            @Valid @RequestBody PasswordUpdateRequest request) {
        return principal.flatMap(p ->
                        userService.updatePassword(p.getName(), request))
                .thenReturn(ResponseEntity.ok("Contraseña actualizada correctamente."));
    }
}
