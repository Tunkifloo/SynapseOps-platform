package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.response.WorkspaceResponse;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.service.FileStorageService;
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
public class DatasetController {

    private final FileStorageService  fileStorageService;
    private final WorkspaceRepository workspaceRepository;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<String>> upload(
            @PathVariable Long workspaceId,
            @RequestPart("file") FilePart file,
            Mono<Principal> principal) {

        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() -> new ResourceNotFoundException("Workspace", workspaceId)))
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
                                            }).subscribeOn(Schedulers.boundedElastic())
                                    );
                        })
        ).map(path -> ResponseEntity.ok(
                "Dataset cargado correctamente. Path: " + path));
    }

    @DeleteMapping("/{filename}")
    public Mono<ResponseEntity<Void>> delete(
            @PathVariable Long workspaceId,
            @PathVariable String filename,
            Mono<Principal> principal) {

        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() -> new ResourceNotFoundException("Workspace", workspaceId)))
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
