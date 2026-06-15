package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.*;

public record ExecutionRequest(

        @NotBlank(message = "El framework es obligatorio.")
        @Pattern(regexp = "(?i)(tensorflow|pytorch)",
                message = "Framework no soportado. Usa 'tensorflow' o 'pytorch'.")
        String framework,

        @NotBlank(message = "La arquitectura es obligatoria.")
        @Pattern(regexp = "(?i)(cnn|efficientnet|mobilenet|resnet)",
                message = "Arquitectura no soportada (cnn | efficientnet | mobilenet | resnet).")
        String architecture,

        @Min(value = 1, message = "Mínimo 1 epoch.")
        @Max(value = 100, message = "Máximo 100 epochs.")
        int epochs,

        @Min(value = 8, message = "Batch size mínimo 8.")
        @Max(value = 256, message = "Batch size máximo 256.")
        int batchSize,

        @DecimalMin(value = "0.00001", message = "Learning rate mínimo 0.00001.")
        @DecimalMax(value = "0.1",     message = "Learning rate máximo 0.1.")
        double learningRate,

        // Opcional: el ML Engine detecta el número real de clases del dataset y lo
        // sobreescribe. Si se envía, se valida el rango; si es null, se ignora.
        @Min(value = 2,   message = "Mínimo 2 clases.")
        @Max(value = 100, message = "Máximo 100 clases.")
        Integer numClasses,

        @NotBlank(message = "El nombre del modelo es obligatorio.")
        String modelName,

        // ── Parametrización de los nodos Preprocesamiento y Split (opcional) ──────
        @Pattern(regexp = "(?i)(normalization|resize)",
                message = "Estrategia de preprocesamiento no soportada (normalization | resize).")
        String preprocessingStrategy,

        @Min(value = 16,  message = "Tamaño de imagen mínimo 16 px.")
        @Max(value = 512, message = "Tamaño de imagen máximo 512 px.")
        Integer imageSize,

        @Min(value = 50, message = "El % de entrenamiento mínimo es 50.")
        @Max(value = 90, message = "El % de entrenamiento máximo es 90.")
        Integer trainRatio,

        // ── Mejoras de CNN / entrenamiento (item 6, opcionales) ──────────────────
        @Pattern(regexp = "(?i)(minmax|zscore|rescale)",
                message = "Normalización no soportada (minmax | zscore | rescale).")
        String normalization,

        Boolean dataAugmentation,

        @Pattern(regexp = "(?i)(adam|adamw|sgd|rmsprop)",
                message = "Optimizador no soportado (adam | adamw | sgd | rmsprop).")
        String optimizer,

        Boolean batchNorm,

        Boolean earlyStopping,

        @Min(value = 1, message = "La paciencia mínima es 1.")
        @Max(value = 50, message = "La paciencia máxima es 50.")
        Integer esPatience,

        @Pattern(regexp = "(?i)(val_loss|val_accuracy|both)",
                message = "Monitor no soportado (val_loss | val_accuracy | both).")
        String esMonitor,

        // ── Catálogo granular de Data Augmentation (JSON) + balanceo de clases ────
        // Viaja como JSON-string; el ML Engine lo deserializa (clave→{enabled,param}).
        String augmentationConfig,

        @Pattern(regexp = "(?i)(off|oversample|undersample|hybrid)",
                message = "Estrategia de balanceo no soportada (off | oversample | undersample | hybrid).")
        String classBalancing,

        @Min(value = 10, message = "El umbral de balanceo mínimo es 10.")
        @Max(value = 80, message = "El umbral de balanceo máximo es 80.")
        Integer balanceThreshold,

        // ── Regularización (CNN adaptativa y cabezas de Transfer Learning) ───────
        @DecimalMin(value = "0.0", message = "El dropout mínimo es 0.0.")
        @DecimalMax(value = "0.9", message = "El dropout máximo es 0.9.")
        Double dropout,

        @DecimalMin(value = "0.0",  message = "La regularización L2 mínima es 0.0.")
        @DecimalMax(value = "0.1",  message = "La regularización L2 máxima es 0.1.")
        Double l2,

        // ── Transfer Learning (2 fases: feature extraction → fine-tuning) ────────
        @Min(value = 1, message = "Mínimo 1 epoch de feature extraction.")
        @Max(value = 50, message = "Máximo 50 epochs de feature extraction.")
        Integer featureExtractionEpochs,

        @DecimalMin(value = "0.00001", message = "Learning rate de feature extraction mínimo 0.00001.")
        @DecimalMax(value = "0.1",     message = "Learning rate de feature extraction máximo 0.1.")
        Double featureExtractionLr,

        @Min(value = 0,   message = "Las epochs de fine-tuning no pueden ser negativas.")
        @Max(value = 100, message = "Máximo 100 epochs de fine-tuning.")
        Integer finetuningEpochs,

        @DecimalMin(value = "0.0000001", message = "Learning rate de fine-tuning mínimo 0.0000001.")
        @DecimalMax(value = "0.1",       message = "Learning rate de fine-tuning máximo 0.1.")
        Double finetuningLr,

        @Min(value = 1,  message = "Mínimo 1 capa a descongelar.")
        @Max(value = 50, message = "Máximo 50 capas a descongelar.")
        Integer unfreezeLayers
) {}
