package com.synapseops.orchestrator.domain.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.synapseops.orchestrator.domain.entity.Role;
import jakarta.validation.constraints.*;

public record UserRegistrationRequest(
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
        @NotNull(message = "El rol es obligatorio.")
        Role role,
        String studentCode,
        @JsonAlias("carrer")
        String career
) {}
