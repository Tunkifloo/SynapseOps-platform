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
        String preprocessingStrategy,
        Integer imageSize,
        Integer trainRatio,
        String normalization,
        Boolean dataAugmentation,
        String optimizer,
        Boolean batchNorm,
        Boolean earlyStopping,
        Integer esPatience,
        String esMonitor,
        // ── Catálogo de augmentation (JSON-string) + balanceo de clases ───────
        String  augmentationConfig,
        String  classBalancing,
        Integer balanceThreshold,
        // ── Regularización ───────────────────────────────────────────────────
        Double  dropout,
        Double  l2,
        // ── Transfer Learning (2 fases) ──────────────────────────────────────
        Integer featureExtractionEpochs,
        Double  featureExtractionLr,
        Integer finetuningEpochs,
        Double  finetuningLr,
        Integer unfreezeLayers,
        // ── HPO (Fase 4) ─────────────────────────────────────────────────────
        Boolean hpo,
        Integer hpoTrials,
        String  hpoEffort
) {}