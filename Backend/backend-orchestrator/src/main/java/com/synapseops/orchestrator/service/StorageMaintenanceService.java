package com.synapseops.orchestrator.service;

/**
 * Gestión del ciclo de vida del volumen {@code /storage}: limpieza en cascada y
 * medición de uso para la cuota por workspace.
 *
 * <p>El volumen tiene dos convenciones de ruta que comparten el namespace numérico:
 * <ul>
 *   <li>Orquestador: {@code /storage/{userId}/{workspaceId}/datasets/…}</li>
 *   <li>ml-engine:   {@code /storage/{workspaceId}/{extracted,models,downloads}/{executionId}/…}</li>
 * </ul>
 * Por eso la limpieza es <b>quirúrgica</b> (sólo subdirectorios conocidos), nunca
 * {@code deleteRecursively(/storage/{workspaceId})} a secas: ese id podría ser el
 * {@code userId} de otro usuario y se borraría su árbol del orquestador.
 */
public interface StorageMaintenanceService {

    /**
     * Borra TODO el almacenamiento de un workspace al eliminarlo: los datasets del
     * orquestador ({@code /storage/{userId}/{workspaceId}}) y los artefactos del
     * ml-engine ({@code extracted/models/downloads} bajo {@code /storage/{workspaceId}}).
     */
    void purgeWorkspace(long userId, long workspaceId);

    /**
     * Borra sólo los artefactos intermedios del ml-engine ({@code extracted} y
     * {@code downloads}) de un workspace. Se usa al borrar/reemplazar el dataset:
     * el material extraído del dataset anterior queda obsoleto. NO toca {@code models}
     * (un modelo entrenado puede estar desplegado y sirviendo inferencias).
     */
    void purgeIntermediate(long workspaceId);

    /**
     * Uso de disco (bytes) de un workspace = datasets del orquestador + artefactos
     * del ml-engine. Base para la cuota {@code storage.max-workspace-mb}.
     */
    long workspaceUsageBytes(long userId, long workspaceId);
}
