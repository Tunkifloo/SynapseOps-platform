package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.*;

public record ExecutionRequest(

        @NotBlank(message = "El framework es obligatorio.")
        String framework,

        @NotBlank(message = "La arquitectura es obligatoria.")
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

        @Min(value = 2,   message = "Mínimo 2 clases.")
        @Max(value = 100, message = "Máximo 100 clases.")
        int numClasses,

        @NotBlank(message = "El nombre del modelo es obligatorio.")
        String modelName
) {}
