package com.synapseops.orchestrator.domain.dto.response;

import com.synapseops.orchestrator.domain.entity.ExecutionStatus;

import java.time.LocalDateTime;

public record ExecutionResponse(
        Long          idExecution,
        ExecutionStatus status,
        LocalDateTime startedAt,
        LocalDateTime finishedAt,
        String        mlflowRunId,
        Long          pipelineId,
        String        modelVersion,
        String        artifactPath,
        String        metrics
) {}