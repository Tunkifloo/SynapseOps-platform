package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import com.synapseops.orchestrator.domain.dto.response.WorkspaceResponse;
import com.synapseops.orchestrator.service.WorkspaceService;
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
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public Flux<WorkspaceResponse> getAllWorkspaces() {
        return workspaceService.getAllWorkspaces();
    }

    @GetMapping
    public Flux<WorkspaceResponse> getMyWorkspaces(Mono<Principal> principal) {
        return principal.flatMapMany(p ->
                workspaceService.getMyWorkspaces(p.getName()));
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<WorkspaceResponse>> getById(
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.getWorkspaceById(id, p.getName()))
                .map(ResponseEntity::ok);
    }

    @PostMapping
    public Mono<ResponseEntity<WorkspaceResponse>> create(
            @Valid @RequestBody WorkspaceRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.createWorkspace(request, p.getName()))
                .map(w -> ResponseEntity.status(HttpStatus.CREATED).body(w));
    }

    @PutMapping("/{id}")
    public Mono<ResponseEntity<WorkspaceResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody WorkspaceRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.updateWorkspace(id, request, p.getName()))
                .map(ResponseEntity::ok);
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> delete(
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        workspaceService.deleteWorkspace(id, p.getName()))
                .thenReturn(ResponseEntity.<Void>noContent().build());
    }
}
