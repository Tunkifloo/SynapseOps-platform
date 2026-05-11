package com.synapseops.orchestrator.domain.dto.response;

import com.synapseops.orchestrator.domain.entity.PipelineStatus;

public record PipelineResponse(
        Long idPipeline,
        String name,
        PipelineStatus status,
        Long idWorkspace,
        int nodeCount,
        int executionCount
) {}
