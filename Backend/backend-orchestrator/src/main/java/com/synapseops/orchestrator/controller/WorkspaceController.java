package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import com.synapseops.orchestrator.domain.dto.response.WorkspaceResponse;
import com.synapseops.orchestrator.service.WorkspaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/workspaces")
@RequiredArgsConstructor
@Tag(name = "Workspaces", description = "Gestión de proyectos/workspaces MLOps")
@SecurityRequirement(name = "bearerAuth")
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    @Operation(summary = "Listar todos los workspaces (Admin)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Lista completa"),
            @ApiResponse(responseCode = "403", description = "Solo ADMIN")
    })
    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<WorkspaceResponse> getAllWorkspaces() {
        return workspaceService.getAllWorkspaces();
    }

    @Operation(summary = "Listar mis workspaces")
    @ApiResponse(responseCode = "200", description = "Workspaces del usuario autenticado")
    @GetMapping
    public Flux<WorkspaceResponse> getMyWorkspaces(Mono<Principal> principal) {
        return principal.flatMapMany(p ->
                workspaceService.getMyWorkspaces(p.getName()));
    }

    @Operation(summary = "Obtener workspace por ID")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workspace encontrado"),
            @ApiResponse(responseCode = "404", description = "No existe"),
            @ApiResponse(responseCode = "403", description = "Sin permisos")
    })
    @GetMapping("/{id}")
    public Mono<ResponseEntity<WorkspaceResponse>> getById(
            @Parameter(description = "ID del workspace") @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.getWorkspaceById(id, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Crear workspace")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Workspace creado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos")
    })
    @PostMapping
    public Mono<ResponseEntity<WorkspaceResponse>> create(
            @Valid @RequestBody WorkspaceRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.createWorkspace(request, p.getName()))
                .map(w -> ResponseEntity.status(HttpStatus.CREATED).body(w));
    }

    @Operation(summary = "Actualizar workspace")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Actualizado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos"),
            @ApiResponse(responseCode = "404", description = "No existe")
    })
    @PutMapping("/{id}")
    public Mono<ResponseEntity<WorkspaceResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody WorkspaceRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.updateWorkspace(id, request, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Eliminar workspace")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Eliminado"),
            @ApiResponse(responseCode = "404", description = "No existe")
    })
    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> delete(
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.deleteWorkspace(id, p.getName()))
                .thenReturn(ResponseEntity.<Void>noContent().build());
    }
}
