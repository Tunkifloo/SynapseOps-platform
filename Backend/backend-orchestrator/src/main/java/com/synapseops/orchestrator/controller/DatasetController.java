package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.service.FileStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/dataset")
@RequiredArgsConstructor
@Tag(name = "Datasets", description = "Carga y eliminación de datasets por workspace")
@SecurityRequirement(name = "bearerAuth")
public class DatasetController {

    private final FileStorageService  fileStorageService;
    private final WorkspaceRepository workspaceRepository;

    @Operation(summary = "Subir dataset",
            description = "Acepta .csv, .png, .jpg — máx 500 MB")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Dataset almacenado, retorna path"),
            @ApiResponse(responseCode = "400", description = "Formato o tamaño inválido"),
            @ApiResponse(responseCode = "403", description = "Sin permisos sobre el workspace"),
            @ApiResponse(responseCode = "404", description = "Workspace no existe")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<String>> upload(
            @PathVariable Long workspaceId,
            @RequestPart("file") FilePart file,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() ->
                                        new ResourceNotFoundException("Workspace", workspaceId)))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMap(workspace -> {
                            if (!workspace.getUser().getUsername().equals(p.getName())) {
                                return Mono.error(new org.springframework.security.access
                                        .AccessDeniedException("Sin permisos sobre este workspace."));
                            }
                            Long userId = workspace.getUser().getIdUser();
                            return fileStorageService.store(file, userId, workspaceId)
                                    .flatMap(storedPath ->
                                            Mono.fromCallable(() -> {
                                                workspace.setDatasetPath(storedPath);
                                                workspaceRepository.save(workspace);
                                                return storedPath;
                                            }).subscribeOn(Schedulers.boundedElastic()));
                        })
        ).map(path -> ResponseEntity.ok("Dataset cargado correctamente. Path: " + path));
    }

    @Operation(summary = "Eliminar dataset")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Eliminado"),
            @ApiResponse(responseCode = "403", description = "Sin permisos"),
            @ApiResponse(responseCode = "404", description = "Workspace o archivo no existe")
    })
    @DeleteMapping("/{filename}")
    public Mono<ResponseEntity<Void>> delete(
            @PathVariable Long workspaceId,
            @PathVariable String filename,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() ->
                                        new ResourceNotFoundException("Workspace", workspaceId)))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMap(workspace -> {
                            if (!workspace.getUser().getUsername().equals(p.getName())) {
                                return Mono.error(new org.springframework.security.access
                                        .AccessDeniedException("Sin permisos sobre este workspace."));
                            }
                            Long userId = workspace.getUser().getIdUser();
                            return fileStorageService.delete(filename, userId, workspaceId)
                                    .then(Mono.fromRunnable(() -> {
                                        workspace.setDatasetPath(null);
                                        workspaceRepository.save(workspace);
                                    }).subscribeOn(Schedulers.boundedElastic()));
                        })
        ).thenReturn(ResponseEntity.<Void>noContent().build());
    }
}
