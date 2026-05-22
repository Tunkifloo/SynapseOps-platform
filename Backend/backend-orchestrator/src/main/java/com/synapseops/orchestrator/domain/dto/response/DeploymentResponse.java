package com.synapseops.orchestrator.domain.dto.response;

public record DeploymentResponse(
        Long   executionId,
        String containerId,
        String modelName,
        String modelVersion,
        String endpoint,
        String status
) {}