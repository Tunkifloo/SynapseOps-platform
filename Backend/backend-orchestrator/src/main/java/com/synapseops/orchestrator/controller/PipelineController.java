package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.PipelineRequest;
import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import com.synapseops.orchestrator.service.PipelineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/pipelines")
@RequiredArgsConstructor
@Tag(name = "Pipelines", description = "Gestión de pipelines MLOps dentro de un workspace")
@SecurityRequirement(name = "bearerAuth")
public class PipelineController {

    private final PipelineService pipelineService;

    @Operation(summary = "Listar pipelines del workspace")
    @ApiResponse(responseCode = "200", description = "Lista de pipelines")
    @GetMapping
    public Flux<PipelineResponse> getByWorkspace(
            @Parameter(description = "ID del workspace") @PathVariable Long workspaceId,
            Mono<Principal> principal) {
        return principal.flatMapMany(p ->
                pipelineService.getPipelinesByWorkspace(workspaceId, p.getName()));
    }

    @Operation(summary = "Obtener pipeline por ID")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Pipeline encontrado"),
            @ApiResponse(responseCode = "404", description = "No existe")
    })
    @GetMapping("/{id}")
    public Mono<ResponseEntity<PipelineResponse>> getById(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.getPipelineById(id, workspaceId, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Crear pipeline")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Pipeline creado"),
            @ApiResponse(responseCode = "400", description = "Datos inválidos")
    })
    @PostMapping
    public Mono<ResponseEntity<PipelineResponse>> create(
            @PathVariable Long workspaceId,
            @Valid @RequestBody PipelineRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.createPipeline(workspaceId, request, p.getName()))
                .map(pipeline -> ResponseEntity.status(HttpStatus.CREATED).body(pipeline));
    }

    @Operation(summary = "Renombrar pipeline")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Renombrado"),
            @ApiResponse(responseCode = "404", description = "No existe")
    })
    @PatchMapping("/{id}/rename")
    public Mono<ResponseEntity<PipelineResponse>> rename(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            @Valid @RequestBody PipelineRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.renamePipeline(id, workspaceId, request, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Guardar topología del lienzo (HU-024)",
            description = "Persiste el JSON del lienzo (nodos + aristas + configuraciones).")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Topología guardada"),
            @ApiResponse(responseCode = "403", description = "Solo el dueño puede modificar"),
            @ApiResponse(responseCode = "404", description = "Pipeline no existe")
    })
    @PutMapping(value = "/{id}/canvas", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Void>> saveCanvas(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            @RequestBody String canvasJson,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.saveCanvas(id, workspaceId, canvasJson, p.getName()))
                .thenReturn(ResponseEntity.<Void>noContent().build());
    }

    @Operation(summary = "Obtener topología del lienzo (HU-024)")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "JSON del lienzo"),
            @ApiResponse(responseCode = "404", description = "Pipeline no existe")
    })
    @GetMapping(value = "/{id}/canvas", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<String>> getCanvas(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.getCanvas(id, workspaceId, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Eliminar pipeline")
    @ApiResponse(responseCode = "204", description = "Eliminado")
    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> delete(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.deletePipeline(id, workspaceId, p.getName()))
                .thenReturn(ResponseEntity.<Void>noContent().build());
    }
}
