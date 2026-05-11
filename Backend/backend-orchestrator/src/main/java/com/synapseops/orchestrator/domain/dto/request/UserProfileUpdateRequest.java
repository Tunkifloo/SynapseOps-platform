package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.Pattern;

public record UserProfileUpdateRequest(
        String name,
        String paternalSurname,
        String maternalSurname,
        @Pattern(regexp = "^\\d{9}$", message = "El teléfono debe tener exactamente 9 dígitos numéricos.")
        String phone
) {}
