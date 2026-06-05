package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForgotPasswordRequest(
        @NotBlank(message = "El username es obligatorio")
        String username,

        @NotBlank(message = "El correo es obligatorio.")
        @Email(message = "El formato del correo electrónico no es válido.")
        String email,

        // Obligatorio para colaboradores (estudiantes); se valida en el servicio.
        String studentCode,

        @NotBlank(message = "La nueva contraseña es obligatoria.")
        @Size(min = 6, message = "La nueva contraseña al menos 6 caracteres.")
        String newPassword
) {}
