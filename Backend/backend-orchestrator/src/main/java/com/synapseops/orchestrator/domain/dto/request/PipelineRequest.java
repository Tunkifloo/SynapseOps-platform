package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PipelineRequest(
        @NotBlank(message = "El nombre del pipeline es obligatorio")
        @Size(max = 100, message = "El nombre no puede superar 100 caracteres")
        String name
) {}
