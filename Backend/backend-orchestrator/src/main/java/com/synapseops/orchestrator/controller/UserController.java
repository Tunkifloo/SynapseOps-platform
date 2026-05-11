package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.PasswordUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserProfileUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserUpdateRequest;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.service.UserService;
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
public class UserController {

    private final UserService userService;

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<UserResponse> getAllUsers() {
        return userService.getAllUsers();
    }

    @GetMapping("/role/{role}")
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<UserResponse> getUsersByRole(@PathVariable Role role) {
        return userService.getUsersByRole(role);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<UserResponse>> getUserById(@PathVariable Long id) {
        return userService.getUserById(id)
                .map(ResponseEntity::ok);
    }

    @GetMapping("/disabled")
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<UserResponse> getDisabledUsers() {
        return userService.getDisabledUsers();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<UserResponse>> updateUser(
            @PathVariable Long id,
            @Valid @RequestBody UserUpdateRequest request) {
        return userService.updateUserByAdmin(id, request)
                .map(ResponseEntity::ok);
    }

    @PatchMapping("/{id}/toggle-status")
    @PreAuthorize("hasRole('ADMIN')")
    public Mono<ResponseEntity<String>> toggleUserStatus(@PathVariable Long id) {
        return userService.toggleUserStatus(id)
                .thenReturn(ResponseEntity.ok("Estado del usuario actualizado correctamente."));
    }

    @GetMapping("/me")
    public Mono<ResponseEntity<UserResponse>> getMyProfile(Mono<Principal> principal) {
        return principal
                .flatMap(p -> userService.getProfile(p.getName()))
                .map(ResponseEntity::ok);
    }

    @PutMapping("/me")
    public Mono<ResponseEntity<UserResponse>> updateMyProfile(
            Mono<Principal> principal,
            @Valid @RequestBody UserProfileUpdateRequest request) {
        return principal
                .flatMap(p -> userService.updateMyProfile(p.getName(), request))
                .map(ResponseEntity::ok);
    }

    @PatchMapping("/me/password")
    public Mono<ResponseEntity<String>> updateMyPassword(
            Mono<Principal> principal,
            @Valid @RequestBody PasswordUpdateRequest request) {
        return principal
                .flatMap(p -> userService.updatePassword(p.getName(), request))
                .thenReturn(ResponseEntity.ok("Contraseña actualizada correctamente."));
    }
}
