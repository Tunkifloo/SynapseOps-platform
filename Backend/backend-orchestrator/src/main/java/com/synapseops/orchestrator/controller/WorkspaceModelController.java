package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.service.WorkspaceModelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.security.Principal;
import java.util.List;
import java.util.Map;

/**
 * Model Registry con alcance por workspace (HU-027).
 *
 * <p>Accesible a COLLABORATOR y ADMIN; la autorización fina (DN-3) se aplica en
 * el servicio: lectura para el dueño/ADMIN, escritura solo para el dueño.
 */
@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/models")
@RequiredArgsConstructor
@Tag(name = "Model Registry (workspace)",
        description = "Modelos versionados de un workspace, respaldados por MLflow")
@SecurityRequirement(name = "bearerAuth")
public class WorkspaceModelController {

    private final WorkspaceModelService workspaceModelService;

    @Operation(summary = "Listar modelos del workspace",
            description = "Modelos del Registry cuyas versiones pertenecen al workspace "
                    + "(resueltos por el grafo de propiedad de artefactos).")
    @ApiResponse(responseCode = "200", description = "Lista de modelos del workspace")
    @GetMapping
    public Mono<ResponseEntity<List<Map<String, Object>>>> listModels(
            @PathVariable Long workspaceId,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceModelService.listModels(workspaceId, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Versiones (del workspace) de un modelo")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Versiones propias del workspace"),
            @ApiResponse(responseCode = "403", description = "Sin acceso al workspace")
    })
    @GetMapping("/{modelName}/versions")
    public Mono<ResponseEntity<List<Map<String, Object>>>> getModelVersions(
            @PathVariable Long workspaceId,
            @PathVariable String modelName,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceModelService.getModelVersions(workspaceId, modelName, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Detalle de una versión (hiperparámetros + métricas)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Params y métricas del run"),
            @ApiResponse(responseCode = "403", description = "Sin acceso al workspace")
    })
    @GetMapping("/{modelName}/versions/{version}/details")
    public Mono<ResponseEntity<Map<String, Object>>> getVersionDetails(
            @PathVariable Long workspaceId,
            @PathVariable String modelName,
            @PathVariable String version,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceModelService.getVersionDetails(workspaceId, modelName, version, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Eliminar una versión propia del workspace",
            description = "Solo el dueño del workspace. Elimina la versión y, best-effort, "
                    + "el run con sus artefactos en MLflow.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Versión eliminada"),
            @ApiResponse(responseCode = "403", description = "No eres el dueño o la versión no es del workspace")
    })
    @DeleteMapping("/{modelName}/versions/{version}")
    public Mono<ResponseEntity<Void>> deleteVersion(
            @PathVariable Long workspaceId,
            @PathVariable String modelName,
            @PathVariable String version,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceModelService.deleteVersion(workspaceId, modelName, version, p.getName()))
                .thenReturn(ResponseEntity.noContent().<Void>build());
    }

    @Operation(summary = "Transicionar el stage de una versión propia",
            description = "Solo el dueño del workspace. Stages: None | Staging | Production | Archived.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Stage actualizado"),
            @ApiResponse(responseCode = "400", description = "Stage inválido"),
            @ApiResponse(responseCode = "403", description = "No eres el dueño o la versión no es del workspace")
    })
    @PostMapping("/{modelName}/versions/{version}/stage")
    public Mono<ResponseEntity<Map<String, Object>>> transitionStage(
            @PathVariable Long workspaceId,
            @PathVariable String modelName,
            @PathVariable String version,
            @RequestBody Map<String, String> body,
            Mono<Principal> principal) {
        String stage = body.getOrDefault("stage", "").trim();
        if (!List.of("None", "Staging", "Production", "Archived").contains(stage)) {
            return Mono.just(ResponseEntity.badRequest()
                    .body(Map.of("error", "Stage inválido: " + stage)));
        }
        return principal.flatMap(p ->
                        workspaceModelService.transitionStage(workspaceId, modelName, version, stage, p.getName()))
                .map(ResponseEntity::ok);
    }
}
