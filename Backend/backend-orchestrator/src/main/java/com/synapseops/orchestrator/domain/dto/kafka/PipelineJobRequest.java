package com.synapseops.orchestrator.domain.dto.kafka;

public record PipelineJobRequest(
        String executionId,
        String pipelineId,
        String workspaceId,
        String datasetPath,
        String framework,
        String architecture,
        int    epochs,
        int    batchSize,
        double learningRate,
        int    numClasses,
        String modelName,
        String preprocessingStrategy
) {}