package com.synapseops.orchestrator.service;

import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

/**
 * Registro de modelos versionados con alcance por workspace (HU-027).
 *
 * <p>MLflow no tiene autenticación: el orquestador es la única frontera de
 * confianza. Cada operación resuelve la propiedad a través del grafo
 * {@code ml_artifacts → execution → pipeline → workspace → user} y aplica RBAC:
 * <ul>
 *   <li>Lectura: ADMIN ve todo; el dueño ve lo suyo (DN-3).</li>
 *   <li>Escritura (eliminar / transicionar stage): solo el dueño del workspace,
 *       sea COLLABORATOR o ADMIN. El ADMIN es solo-lectura sobre lo ajeno.</li>
 * </ul>
 */
public interface WorkspaceModelService {

    Mono<List<Map<String, Object>>> listModels(Long workspaceId, String username);

    Mono<List<Map<String, Object>>> getModelVersions(
            Long workspaceId, String modelName, String username);

    Mono<Void> deleteVersion(
            Long workspaceId, String modelName, String version, String username);

    Mono<Map<String, Object>> transitionStage(
            Long workspaceId, String modelName, String version, String stage, String username);
}
