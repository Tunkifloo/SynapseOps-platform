package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordUpdateRequest(
        @NotBlank(message = "Debe ingresar su contraseña actual.")
        String currentPassword,
        @NotBlank(message = "La nueva contraseña es obligatoria.")
        @Size(min = 6, message = "La nueva contraseña debe al menos 6 caracteres.")
        String newPassword
) {}
