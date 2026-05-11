package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.PipelineRequest;
import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import com.synapseops.orchestrator.service.PipelineService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/pipelines")
@RequiredArgsConstructor
public class PipelineController {

    private final PipelineService pipelineService;

    @GetMapping
    public Flux<PipelineResponse> getByWorkspace(
            @PathVariable Long workspaceId,
            Mono<Principal> principal) {
        return principal.flatMapMany(p ->
                pipelineService.getPipelinesByWorkspace(workspaceId, p.getName()));
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<PipelineResponse>> getById(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.getPipelineById(id, p.getName()))
                .map(ResponseEntity::ok);
    }

    @PostMapping
    public Mono<ResponseEntity<PipelineResponse>> create(
            @PathVariable Long workspaceId,
            @Valid @RequestBody PipelineRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.createPipeline(workspaceId, request, p.getName()))
                .map(pipeline -> ResponseEntity.status(HttpStatus.CREATED).body(pipeline));
    }

    @PatchMapping("/{id}/rename")
    public Mono<ResponseEntity<PipelineResponse>> rename(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            @Valid @RequestBody PipelineRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.renamePipeline(id, request, p.getName()))
                .map(ResponseEntity::ok);
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Void>> delete(
            @PathVariable Long workspaceId,
            @PathVariable Long id,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        pipelineService.deletePipeline(id, p.getName()))
                .thenReturn(ResponseEntity.<Void>noContent().build());
    }
}
