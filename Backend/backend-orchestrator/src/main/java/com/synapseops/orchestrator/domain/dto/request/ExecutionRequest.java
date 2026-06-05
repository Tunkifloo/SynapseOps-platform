package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.*;

public record ExecutionRequest(

        @NotBlank(message = "El framework es obligatorio.")
        @Pattern(regexp = "(?i)(tensorflow|pytorch)",
                message = "Framework no soportado. Usa 'tensorflow' o 'pytorch'.")
        String framework,

        @NotBlank(message = "La arquitectura es obligatoria.")
        @Pattern(regexp = "(?i)cnn",
                message = "Arquitectura no soportada. Actualmente solo está disponible 'cnn'.")
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
        String modelName
) {}
