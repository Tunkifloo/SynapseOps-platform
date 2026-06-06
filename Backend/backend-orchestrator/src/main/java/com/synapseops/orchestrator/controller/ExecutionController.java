package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.domain.dto.request.ExecutionRequest;
import com.synapseops.orchestrator.domain.dto.response.ExecutionResponse;
import com.synapseops.orchestrator.infra.sse.ExecutionEventBus;
import com.synapseops.orchestrator.infra.sse.ExecutionLogEvent;
import com.synapseops.orchestrator.service.ExecutionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.security.Principal;
import java.time.Duration;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/pipelines/{pipelineId}")
@RequiredArgsConstructor
@Tag(name = "Executions", description = "Lanzamiento y monitoreo de ejecuciones MLOps")
@SecurityRequirement(name = "bearerAuth")
public class ExecutionController {

    private final ExecutionService executionService;
    private final ExecutionEventBus executionEventBus;

    @Operation(summary = "Lanzar re-entrenamiento",
            description = "Crea PipelineExecution, publica en Kafka → ml-engine entrena.")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Entrenamiento lanzado"),
            @ApiResponse(responseCode = "400", description = "Sin dataset o datos inválidos"),
            @ApiResponse(responseCode = "404", description = "Pipeline no encontrado")
    })
    @PostMapping("/execute")
    public Mono<ResponseEntity<ExecutionResponse>> execute(
            @PathVariable Long workspaceId,
            @PathVariable Long pipelineId,
            @Valid @RequestBody ExecutionRequest request,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        executionService.launchExecution(
                                pipelineId, workspaceId, request, p.getName()))
                .map(r -> ResponseEntity.status(HttpStatus.ACCEPTED).body(r));
    }

    @Operation(summary = "Listar ejecuciones del pipeline")
    @ApiResponse(responseCode = "200", description = "Lista de ejecuciones")
    @GetMapping("/executions")
    public Flux<ExecutionResponse> getExecutions(
            @PathVariable Long workspaceId,
            @PathVariable Long pipelineId,
            Mono<Principal> principal) {
        return principal.flatMapMany(p ->
                executionService.getExecutionsByPipeline(pipelineId, p.getName()));
    }

    @Operation(summary = "Estado de una ejecución específica")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Estado + métricas si completó"),
            @ApiResponse(responseCode = "404", description = "Ejecución no encontrada")
    })
    @GetMapping("/executions/{executionId}")
    public Mono<ResponseEntity<ExecutionResponse>> getExecution(
            @PathVariable Long workspaceId,
            @PathVariable Long pipelineId,
            @PathVariable Long executionId,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                        executionService.getExecution(executionId, p.getName()))
                .map(ResponseEntity::ok);
    }

    @Operation(summary = "Stream de logs en tiempo real (SSE — HU-023 / ADR-002)",
            description = "text/event-stream con eventos de log/estado de la ejecución. "
                    + "EventSource autentica con ?token=<JWT> (no admite cabeceras).")
    @GetMapping(value = "/executions/{executionId}/logs",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<ExecutionLogEvent>> streamLogs(
            @PathVariable Long workspaceId,
            @PathVariable Long pipelineId,
            @PathVariable Long executionId) {

        Flux<ServerSentEvent<ExecutionLogEvent>> events = executionEventBus
                .stream(String.valueOf(executionId))
                .map(event -> ServerSentEvent.<ExecutionLogEvent>builder(event)
                        .id(event.timestamp())
                        .event("log")
                        .build());

        // Heartbeat (comentario SSE) para mantener viva la conexión tras proxies.
        Flux<ServerSentEvent<ExecutionLogEvent>> heartbeat = Flux.interval(Duration.ofSeconds(20))
                .map(tick -> ServerSentEvent.<ExecutionLogEvent>builder()
                        .comment("keep-alive")
                        .build());

        return events.mergeWith(heartbeat);
    }
}