package com.synapseops.orchestrator.mapper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import com.synapseops.orchestrator.domain.entity.Pipeline;
import com.synapseops.orchestrator.infra.repository.PipelineExecutionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PipelineMapper {

    private final ObjectMapper objectMapper;
    private final PipelineExecutionRepository executionRepository;

    public PipelineResponse toResponse(Pipeline pipeline) {
        long workspaceId = 0;
        try {
            workspaceId = pipeline.getWorkspace().getIdWorkspace();
        } catch (Exception ignored) {
            // workspace lazy fuera de sesión: se deja 0
        }

        // nodeCount desde el JSON del lienzo (columna, no colección lazy) — HU-024.
        int nodeCount = countCanvasNodes(pipeline.getCanvasJson());

        // executionCount vía consulta count (evita LazyInitializationException en WebFlux).
        long executionCount = 0;
        try {
            executionCount = executionRepository.countByPipeline_IdPipeline(pipeline.getIdPipeline());
        } catch (Exception ignored) {
            // no bloquear el mapeo si la consulta falla
        }

        return new PipelineResponse(
                pipeline.getIdPipeline(),
                pipeline.getName(),
                pipeline.getStatus(),
                workspaceId,
                nodeCount,
                (int) executionCount
        );
    }

    private int countCanvasNodes(String canvasJson) {
        if (canvasJson == null || canvasJson.isBlank()) {
            return 0;
        }
        try {
            JsonNode nodes = objectMapper.readTree(canvasJson).path("nodes");
            return nodes.isArray() ? nodes.size() : 0;
        } catch (Exception e) {
            return 0;
        }
    }
}
