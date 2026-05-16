package com.synapseops.orchestrator.mapper;

import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import com.synapseops.orchestrator.domain.entity.Pipeline;
import org.springframework.stereotype.Component;

@Component
public class PipelineMapper {

    public PipelineResponse toResponse(Pipeline pipeline) {
        int nodeCount = 0;
        int executionCount = 0;
        long workspaceId = 0;
        try {
            workspaceId = pipeline.getWorkspace().getIdWorkspace();
        } catch (Exception ignored) {
        }
        try {
            nodeCount = pipeline.getNodes().size();
        } catch (Exception ignored) {
        }
        try {
            executionCount = pipeline.getExecutions().size();
        } catch (Exception ignored) {
        }
        return new PipelineResponse(
                pipeline.getIdPipeline(),
                pipeline.getName(),
                pipeline.getStatus(),
                workspaceId,
                nodeCount,
                executionCount
        );
    }
}
