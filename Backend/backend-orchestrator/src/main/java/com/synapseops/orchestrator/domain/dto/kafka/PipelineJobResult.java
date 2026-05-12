package com.synapseops.orchestrator.domain.dto.kafka;

public record PipelineJobResult(
        String executionId,
        String status,
        String mlflowRunId,
        String artifactUri,
        String errorMessage
) {}