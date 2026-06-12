package com.synapseops.orchestrator.domain.dto.response;

import java.util.List;

/**
 * Uso real de disco del usuario, por workspace, para que el frontend muestre cuánto
 * ocupa cada proyecto frente a su cuota y qué puede gestionar (UX de almacenamiento).
 *
 * @param maxFileSizeMb   tamaño máximo por archivo (MB)
 * @param maxWorkspaceMb  cuota de disco por workspace (MB)
 * @param totalUsedBytes  suma del uso de todos los workspaces del usuario (bytes)
 * @param workspaces      uso por workspace
 */
public record StorageUsageResponse(
        long maxFileSizeMb,
        long maxWorkspaceMb,
        long totalUsedBytes,
        List<WorkspaceUsage> workspaces) {

    /**
     * @param workspaceId id del workspace
     * @param name        nombre del proyecto
     * @param usedBytes   uso de disco del workspace (datasets + artefactos del ml-engine)
     */
    public record WorkspaceUsage(long workspaceId, String name, long usedBytes) {
    }
}
