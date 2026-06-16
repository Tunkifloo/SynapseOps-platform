package com.synapseops.orchestrator.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.entity.MLArtifact;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.domain.entity.Workspace;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.mlflow.MLflowFacade;
import com.synapseops.orchestrator.infra.repository.MLArtifactRepository;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.service.WorkspaceModelService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkspaceModelServiceImpl implements WorkspaceModelService {

    private final WorkspaceRepository  workspaceRepository;
    private final UserRepository       userRepository;
    private final MLArtifactRepository artifactRepository;
    private final MLflowFacade         mlflowFacade;
    private final ObjectMapper         objectMapper;

    @Override
    public Mono<List<Map<String, Object>>> listModels(Long workspaceId, String username) {
        return ownedArtifacts(workspaceId, username, false)
                .flatMap(metricsByRun -> {
                    if (metricsByRun.isEmpty()) {
                        return Mono.just(List.<Map<String, Object>>of());
                    }
                    return mlflowFacade.listRegisteredModels()
                            .flatMapMany(Flux::fromIterable)
                            .flatMap(model -> toOwnedModelCard(model, metricsByRun))
                            .filter(Optional::isPresent)
                            .map(Optional::get)
                            .collectList();
                });
    }

    private Mono<Optional<Map<String, Object>>> toOwnedModelCard(
            Map<String, Object> model, Map<String, double[]> metricsByRun) {
        String name = String.valueOf(model.get("name"));
        return mlflowFacade.getModelVersions(name)
                .map(versions -> {
                    // Propiedad por NOMBRE: el modelo es del workspace si entrenó ≥1 de
                    // sus versiones (su run_id está en ml_artifacts). En tal caso se
                    // exponen TODAS sus versiones (paridad con la consola ADMIN).
                    if (versions.isEmpty() || !isOwned(versions, metricsByRun.keySet())) {
                        return Optional.empty();
                    }
                    Map<String, Object> latest = versions.get(0); // desc → la más reciente
                    Map<String, Object> card = new HashMap<>();
                    card.put("name",          name);
                    card.put("latestVersion", latest.get("version"));
                    card.put("latestRunId",   latest.get("runId"));
                    card.put("ownedVersions", versions.size());
                    return Optional.of(card);
                });
    }

    @Override
    public Mono<List<Map<String, Object>>> getModelVersions(
            Long workspaceId, String modelName, String username) {
        return ownedArtifacts(workspaceId, username, false)
                .flatMap(metricsByRun -> mlflowFacade.getModelVersions(modelName)
                        .flatMap(versions -> {
                            if (!isOwned(versions, metricsByRun.keySet())) {
                                return Mono.just(List.<Map<String, Object>>of());
                            }
                            // Modelo propio → TODAS las versiones, enriquecidas con métricas
                            // (embebidas de ml_artifacts o, si faltan, desde el run de MLflow).
                            return Flux.fromIterable(versions)
                                    .concatMap(v -> enrichVersionMetrics(v, metricsByRun))
                                    .collectList();
                        }));
    }

    private boolean isOwned(List<Map<String, Object>> versions, Set<String> ownedRunIds) {
        return versions.stream().anyMatch(v -> ownedRunIds.contains(String.valueOf(v.get("runId"))));
    }

    private Mono<Map<String, Object>> enrichVersionMetrics(
            Map<String, Object> version, Map<String, double[]> metricsByRun) {
        String runId = String.valueOf(version.get("runId"));
        if (metricsByRun.containsKey(runId)) {
            attachMetrics(version, metricsByRun);
            return Mono.just(version);
        }
        // Sin fila en ml_artifacts → métricas desde el run de MLflow (paridad con ADMIN).
        return mlflowFacade.getRunMetrics(runId)
                .map(m -> {
                    if (m.accuracy() > 0) {
                        version.put("accuracy", m.accuracy());
                    }
                    if (m.loss() > 0) {
                        version.put("loss", m.loss());
                    }
                    return version;
                })
                .onErrorReturn(version);
    }

    @Override
    public Mono<Map<String, Object>> getVersionDetails(
            Long workspaceId, String modelName, String version, String username) {
        return ownedArtifacts(workspaceId, username, false)
                .flatMap(metricsByRun -> mlflowFacade.getModelVersions(modelName)
                        .flatMap(versions -> {
                            if (!isOwned(versions, metricsByRun.keySet())) {
                                return Mono.error(new AccessDeniedException(
                                        "El modelo no pertenece a este workspace."));
                            }
                            return mlflowFacade.getRunIdForVersion(modelName, version)
                                    .flatMap(runId -> (runId == null || runId.isBlank())
                                            ? Mono.just(Map.<String, Object>of())
                                            : enrichWithInterpretability(runId));
                        }));
    }

    /**
     * Resumen del run + galería Score-CAM (si existe) embebida como data-URL base64
     * en la clave "scorecam", para mostrarla en el detalle del modelo (Ticket UX-4 /
     * interpretabilidad). Best-effort: si no hay galería, devuelve el resumen sin ella.
     */
    private Mono<Map<String, Object>> enrichWithInterpretability(String runId) {
        return mlflowFacade.getRunSummary(runId).flatMap(summary ->
                mlflowFacade.downloadArtifactBase64(runId, "interpretability/scorecam_gallery.png")
                        .map(img -> {
                            summary.put("scorecam", img);
                            return summary;
                        })
                        .defaultIfEmpty(summary));
    }

    @Override
    public Mono<Void> deleteVersion(
            Long workspaceId, String modelName, String version, String username) {
        // defer: MLflow no se invoca hasta que la autorización pasa.
        return authorizeVersionWrite(workspaceId, modelName, version, username)
                .then(Mono.defer(() -> mlflowFacade.deleteModelVersion(modelName, version)));
    }

    @Override
    public Mono<Map<String, Object>> transitionStage(
            Long workspaceId, String modelName, String version, String stage, String username) {
        return authorizeVersionWrite(workspaceId, modelName, version, username)
                .then(Mono.defer(() -> mlflowFacade.transitionStage(modelName, version, stage)));
    }

    /**
     * Autoriza la escritura (eliminar / transicionar stage): el usuario debe ser
     * dueño del workspace (verifyOwnership) y el MODELO debe pertenecer al
     * workspace (entrenó ≥1 de sus versiones). Evita manipular modelos ajenos
     * pasando un workspaceId propio; permite gestionar cualquier versión de un
     * modelo propio (coherente con la vista por nombre).
     */
    private Mono<Void> authorizeVersionWrite(
            Long workspaceId, String modelName, String version, String username) {
        return ownedArtifacts(workspaceId, username, true)
                .flatMap(owned -> mlflowFacade.getModelVersions(modelName)
                        .flatMap(versions -> {
                            if (!isOwned(versions, owned.keySet())) {
                                return Mono.error(new AccessDeniedException(
                                        "El modelo no pertenece a este workspace."));
                            }
                            return Mono.empty();
                        }));
    }

    /**
     * Resuelve, tras aplicar RBAC, el mapa {@code run_id → [accuracy, loss]} de
     * los artefactos del workspace. Parte bloqueante (JPA) aislada en
     * boundedElastic. Su {@code keySet} es el conjunto de run_ids "propios".
     *
     * @param writeAccess true → exige propiedad (escritura); false → lectura
     *                    (ADMIN ve todo, dueño ve lo suyo — DN-3).
     */
    private Mono<Map<String, double[]>> ownedArtifacts(
            Long workspaceId, String username, boolean writeAccess) {
        return Mono.fromCallable(() -> {
            Workspace workspace = workspaceRepository.findById(workspaceId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Workspace no encontrado con ID: " + workspaceId));
            if (writeAccess) {
                verifyOwnership(workspace, username);
            } else {
                verifyAccess(workspace, username);
            }
            Map<String, double[]> metricsByRun = new HashMap<>();
            for (MLArtifact artifact : artifactRepository.findByWorkspace(workspaceId)) {
                metricsByRun.put(artifact.getRunId(), parseMetrics(artifact.getMetrics()));
            }
            return metricsByRun;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private void attachMetrics(Map<String, Object> version, Map<String, double[]> metricsByRun) {
        double[] m = metricsByRun.get(String.valueOf(version.get("runId")));
        if (m == null) {
            return;
        }
        if (!Double.isNaN(m[0])) {
            version.put("accuracy", m[0]);
        }
        if (!Double.isNaN(m[1])) {
            version.put("loss", m[1]);
        }
    }

    private double[] parseMetrics(String json) {
        double accuracy = Double.NaN;
        double loss     = Double.NaN;
        try {
            JsonNode node = objectMapper.readTree(json == null || json.isBlank() ? "{}" : json);
            accuracy = firstNumeric(node, "test_accuracy", "val_accuracy", "final_accuracy", "accuracy");
            loss     = firstNumeric(node, "test_loss", "val_loss", "final_loss", "loss");
        } catch (Exception ignored) {
            // métricas informativas: si el JSON es inválido, se omiten
        }
        return new double[]{accuracy, loss};
    }

    private double firstNumeric(JsonNode node, String... keys) {
        for (String key : keys) {
            if (node.has(key) && node.get(key).isNumber()) {
                return node.get(key).asDouble();
            }
        }
        return Double.NaN;
    }

    private void verifyOwnership(Workspace workspace, String username) {
        if (!workspace.getUser().getUsername().equals(username)) {
            throw new AccessDeniedException("No tienes permiso para gestionar este recurso.");
        }
    }

    private void verifyAccess(Workspace workspace, String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username));
        if (user.getRole() == Role.ADMIN) {
            return;
        }
        if (!workspace.getUser().getUsername().equals(username)) {
            throw new AccessDeniedException("No tienes permiso para acceder a este recurso.");
        }
    }
}
