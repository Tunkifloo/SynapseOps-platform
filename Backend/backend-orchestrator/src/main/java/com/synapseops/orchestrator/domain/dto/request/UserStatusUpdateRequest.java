package com.synapseops.orchestrator.domain.dto.request;

import jakarta.validation.constraints.NotNull;

/**
 * Petición idempotente para activar/desactivar una cuenta de usuario (soft-delete).
 * A diferencia de un "toggle", el estado deseado se envía explícitamente, por lo que
 * repetir la misma petición produce siempre el mismo resultado (Richardson Nivel 2).
 */
public record UserStatusUpdateRequest(
        @NotNull(message = "El campo 'enabled' es obligatorio.")
        Boolean enabled
) {}
