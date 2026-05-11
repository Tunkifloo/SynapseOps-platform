package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkspaceRequest(
        @NotBlank(message = "El nombre del workspace es obligatorio")
        @Size(max = 100, message = "El nombre no puede superar 100 caracteres")
        String name,

        @Size(max = 1000, message = "La descripción no puede superar 1000 caracteres")
        String description
) {}