package com.synapseops.orchestrator.infra.mlflow;

public record MlflowRunMetrics(
        double accuracy,
        double loss,
        double valAccuracy
) {}