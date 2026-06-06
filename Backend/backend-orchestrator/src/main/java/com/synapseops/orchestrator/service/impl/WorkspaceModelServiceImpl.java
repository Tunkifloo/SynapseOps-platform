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
                    List<Map<String, Object>> ownedVersions = versions.stream()
                            .filter(v -> metricsByRun.containsKey(String.valueOf(v.get("runId"))))
                            .toList();
                    if (ownedVersions.isEmpty()) {
                        return Optional.empty();
                    }
                    // Versiones ordenadas desc por el facade → la primera es la más reciente.
                    Map<String, Object> latest = ownedVersions.get(0);
                    Map<String, Object> card = new HashMap<>();
                    card.put("name",          name);
                    card.put("latestVersion", latest.get("version"));
                    card.put("latestRunId",   latest.get("runId"));
                    card.put("ownedVersions", ownedVersions.size());
                    return Optional.of(card);
                });
    }

    @Override
    public Mono<List<Map<String, Object>>> getModelVersions(
            Long workspaceId, String modelName, String username) {
        return ownedArtifacts(workspaceId, username, false)
                .flatMap(metricsByRun -> mlflowFacade.getModelVersions(modelName)
                        .map(versions -> versions.stream()
                                .filter(v -> metricsByRun.containsKey(String.valueOf(v.get("runId"))))
                                .peek(v -> attachMetrics(v, metricsByRun))
                                .toList()));
    }

    @Override
    public Mono<Void> deleteVersion(
            Long workspaceId, String modelName, String version, String username) {
        return authorizeVersionWrite(workspaceId, modelName, version, username)
                .then(mlflowFacade.deleteModelVersion(modelName, version));
    }

    @Override
    public Mono<Map<String, Object>> transitionStage(
            Long workspaceId, String modelName, String version, String stage, String username) {
        return authorizeVersionWrite(workspaceId, modelName, version, username)
                .then(mlflowFacade.transitionStage(modelName, version, stage));
    }

    /**
     * Verifica que el usuario sea dueño del workspace (escritura) y que la
     * versión pertenezca efectivamente a ese workspace (su run_id está entre los
     * artefactos del workspace). Evita que un dueño manipule modelos ajenos
     * pasando su propio workspaceId.
     */
    private Mono<Void> authorizeVersionWrite(
            Long workspaceId, String modelName, String version, String username) {
        return ownedArtifacts(workspaceId, username, true)
                .flatMap(owned -> mlflowFacade.getRunIdForVersion(modelName, version)
                        .flatMap(runId -> {
                            if (runId == null || runId.isBlank() || !owned.containsKey(runId)) {
                                return Mono.error(new AccessDeniedException(
                                        "La versión no pertenece a este workspace."));
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
