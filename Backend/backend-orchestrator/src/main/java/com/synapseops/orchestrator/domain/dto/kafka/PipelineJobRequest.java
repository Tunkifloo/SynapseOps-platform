package com.synapseops.orchestrator.domain.dto.kafka;

public record PipelineJobRequest(
        String executionId,
        String workspaceId,
        String datasetPath,
        String framework,
        String architecture,
        int    epochs,
        int    batchSize,
        String preprocessingStrategy
) {}
