package com.synapseops.orchestrator.domain.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Auto-registro público (DN-5 / HU-017). No incluye `role`: el servicio fuerza
 * siempre COLLABORATOR, de modo que un ADMIN nunca puede crearse por esta vía.
 */
public record SignupRequest(
        @NotBlank(message = "El username es obligatorio.")
        String username,

        @NotBlank(message = "La contraseña es obligatoria.")
        @Size(min = 7, message = "La contraseña debe tener más de 6 caracteres.")
        String password,

        @NotBlank(message = "El nombre es obligatorio.")
        String name,

        @NotBlank(message = "El apellido paterno es obligatorio.")
        String paternalSurname,

        String maternalSurname,

        @Email(message = "El formato del correo electrónico no es válido.")
        @NotBlank(message = "El correo es obligatorio.")
        String email,

        @Pattern(regexp = "^\\d{9}$", message = "El teléfono debe tener exactamente 9 dígitos numéricos.")
        String phone,

        @NotBlank(message = "El código de estudiante es obligatorio.")
        String studentCode,

        @NotBlank(message = "La carrera es obligatoria.")
        @JsonAlias("carrer")
        String career
) {}
