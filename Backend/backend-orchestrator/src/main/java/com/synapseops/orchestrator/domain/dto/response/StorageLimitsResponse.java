package com.synapseops.orchestrator.domain.dto.response;

import java.util.List;

/**
 * Límites efectivos del almacenamiento, expuestos para que el frontend los consuma
 * en runtime (fuente única de verdad). Evita constantes hardcodeadas / variables de
 * build desincronizadas con el backend.
 *
 * @param maxFileSizeMb     tamaño máximo por archivo (MB)
 * @param maxWorkspaceMb    cuota de disco por workspace (MB)
 * @param allowedExtensions extensiones aceptadas, sin punto (p. ej. "png", "zip")
 */
public record StorageLimitsResponse(
        long maxFileSizeMb,
        long maxWorkspaceMb,
        List<String> allowedExtensions) {
}
