package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForgotPasswordRequest(
        @NotBlank(message = "El username es obligatorio")
        String username,
        @NotBlank(message = "La nueva contraseña es obligatoria.")
        @Size(min = 6, message = "La nueva contraseña al menos 6 caracteres.")
        String newPassword
) {}
