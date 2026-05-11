package com.synapseops.orchestrator.domain.dto.request;

import com.synapseops.orchestrator.domain.entity.Role;
import jakarta.validation.constraints.Pattern;

public record UserUpdateRequest(
        String name,
        String paternalSurname,
        String maternalSurname,
        @Pattern(regexp = "^\\d{8}$", message = "El DNI debe tener exactamente 8 dígitos numéricos.")
        String dni,
        String email,
        @Pattern(regexp = "^\\d{9}$", message = "El teléfono debe tener exactamente 9 dígitos numéricos.")
        String phone,
        Role role
) {}
