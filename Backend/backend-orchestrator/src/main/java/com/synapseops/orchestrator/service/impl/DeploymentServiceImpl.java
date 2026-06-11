package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.domain.dto.response.DeploymentResponse;
import com.synapseops.orchestrator.domain.dto.response.DeploymentItem;
import com.synapseops.orchestrator.domain.dto.response.DeploymentsView;
import com.synapseops.orchestrator.domain.entity.MLArtifact;
import com.synapseops.orchestrator.domain.entity.PipelineExecution;
import com.synapseops.orchestrator.infra.docker.DockerFacade;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.MLArtifactRepository;
import com.synapseops.orchestrator.infra.repository.PipelineExecutionRepository;
import com.synapseops.orchestrator.service.DeploymentService;
import com.synapseops.orchestrator.service.builder.DockerfileBuilder;
import com.synapseops.orchestrator.service.builder.DockerComposeBuilder;
import com.synapseops.orchestrator.infra.mlflow.MLflowFacade;
import com.synapseops.orchestrator.infra.sse.ExecutionEventBus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeploymentServiceImpl implements DeploymentService {

    private final PipelineExecutionRepository executionRepository;
    private final MLArtifactRepository        artifactRepository;
    private final DockerFacade                dockerFacade;
    private final DockerfileBuilder           dockerfileBuilder;
    private final DockerComposeBuilder        dockerComposeBuilder;
    private final MLflowFacade                mlflowFacade;
    private final ExecutionEventBus           executionEventBus;
    private final ObjectMapper                objectMapper;

    @Value("${storage.base-path:/storage}")
    private String storageBasePath;

    @Value("${synapseops.model-service.max-deployments:3}")
    private int maxDeployments;

    @Override
    public Mono<DeploymentResponse> deploy(Long executionId, String username) {
        return Mono.fromCallable(() -> {

            PipelineExecution execution = executionRepository.findByIdWithDetails(executionId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Ejecución no encontrada: " + executionId));

            if (!execution.getPipeline().getWorkspace()
                    .getUser().getUsername().equals(username)) {
                throw new AccessDeniedException("Sin permisos sobre esta ejecución.");
            }

            MLArtifact artifact = execution.getArtifact();
            if (artifact == null) {
                throw new IllegalStateException(
                        "La ejecución no tiene un artefacto registrado. " +
                                "Asegúrate de que el entrenamiento completó correctamente.");
            }

            String modelName    = artifact.getModelVersion() != null
                    ? artifact.getModelVersion() : "model_v1";
            String artifactPath = artifact.getArtifactPath();
            String serviceName  = "model-service-exec-" + executionId;
            String execId       = String.valueOf(executionId);
            Long   workspaceId  = execution.getPipeline().getWorkspace().getIdWorkspace();
            String containerName = "modelo_" + workspaceId;            // TA-003 · nombre único

            // TA-004 · Tope de despliegues concurrentes (RN-001 · sesión 1:1 por PC).
            // Un redepliegue del mismo workspace no cuenta (reemplaza su contenedor).
            var activeDeployments = dockerFacade.listModelServiceContainers();
            boolean isRedeploy = activeDeployments.stream()
                    .flatMap(c -> java.util.Arrays.stream(c.getNames()))
                    .anyMatch(n -> n.equals("/" + containerName) || n.equals(containerName));
            if (!isRedeploy && activeDeployments.size() >= maxDeployments) {
                executionEventBus.publish(execId, "ERROR",
                        "Límite de despliegues activos alcanzado (" + maxDeployments
                                + "). Derriba un model-service en 'Despliegues' antes de crear otro.",
                        true);   // terminal: fin del ciclo (despliegue rechazado)
                throw new IllegalStateException(
                        "Límite de despliegues activos alcanzado (" + maxDeployments + ").");
            }

            int    hostPort      = dockerFacade.findFreePort(8001);    // TA-002 · puerto dinámico

            // Framework según la extensión del artefacto (.keras/.h5 → tf, .pt/.pth → torch).
            String framework = dockerfileBuilder.reset()
                    .setArtifactPath(artifactPath)
                    .resolveFramework();

            log.info("Iniciando despliegue — executionId={} model={} framework={} path={}",
                    executionId, modelName, framework, artifactPath);
            executionEventBus.publish(execId, "INFO",
                    "Despliegue iniciado para '" + containerName + "'. Puede tardar varios minutos "
                            + "(build de la imagen); te notificaremos cuando esté listo.");

            long genStart = System.currentTimeMillis();

            // HU-007 · Gobernanza (ADR-007): el run debe existir en MLflow. Es no-fatal:
            // el artefacto binario ya reside en el volumen compartido /storage.
            String artifactUri = mlflowFacade.getArtifactUri(artifact.getRunId())
                    .onErrorReturn("")
                    .blockOptional().orElse("");
            if (artifactUri.isBlank()) {
                log.warn("HU-007 · runId={} sin artifact_uri en MLflow; se usa el artefacto de /storage.",
                        artifact.getRunId());
            }

            // HU-007 · Genera Dockerfile (plantilla estática TA-007) + docker-compose.yml (SnakeYAML, ADR-009).
            String dockerfile = dockerfileBuilder.build();

            String composeYaml = dockerComposeBuilder.reset()
                    .setServiceName(containerName)
                    .setImage(serviceName + ":latest")
                    .addPort(hostPort, 8000)
                    .addEnvVar("MODEL_PATH", artifactPath)
                    .addVolume(storageBasePath + ":" + storageBasePath + ":ro")
                    .build();

            // HU-007 · Validación YAML sintáctica antes de usar el manifiesto + persistencia.
            validateComposeYaml(composeYaml);
            persistManifests(executionId, dockerfile, composeYaml);

            long genElapsed = System.currentTimeMillis() - genStart;
            log.info("HU-007 · Artefactos generados y validados en {} ms (umbral 5000 ms)", genElapsed);

            executionEventBus.publish(execId, "INFO",
                    "Construyendo imagen del model-service (framework=" + framework
                            + ", puede tardar)…");
            String imageId = dockerFacade.buildImage(dockerfile, serviceName, framework);
            log.info("Imagen construida: {} → {}", serviceName, imageId);
            executionEventBus.publish(execId, "INFO", "Imagen construida. Levantando contenedor…");

            // Contrato de la plantilla TA-007: el artefacto se lee de MODEL_PATH
            // (sobre el volumen /storage compartido montado por DockerFacade).
            // CLASS_NAMES (opcional): etiqueta las predicciones del /predict con los
            // nombres reales de clase (desde el tag confusion_matrix del run en MLflow).
            String classNames = resolveClassNames(artifact.getRunId());
            Map<String, String> envVars = classNames.isBlank()
                    ? Map.of("MODEL_PATH", artifactPath)
                    : Map.of("MODEL_PATH", artifactPath, "CLASS_NAMES", classNames);

            String containerId = dockerFacade.runContainer(imageId, envVars, containerName, hostPort);
            log.info("Contenedor levantado: {} (:{}) → {}", containerName, hostPort, containerId);
            executionEventBus.publish(execId, "INFO",
                    "model-service '" + containerName + "' levantado en :" + hostPort
                            + ". Ejecutando health check...");

            artifact.setHyperparameters(
                    artifact.getHyperparameters() + ",\"containerId\":\"" + containerId + "\""
            );
            artifactRepository.save(artifact);

            // TA-001 · Health check con reintentos (5 × backoff 2 s) + medición de cold start.
            // El backend alcanza al model-service por nombre de contenedor en mlops-network.
            // 20 reintentos × 2 s (≈40 s): el arranque del model-service (importar torch/TF
            // + cargar el modelo) puede tardar bastante en discos lentos.
            long coldStartStart = System.currentTimeMillis();
            boolean healthy = dockerFacade.waitForHttpHealthy(containerId, 8000, 20, 2000);
            long coldStartMs = System.currentTimeMillis() - coldStartStart;

            // TA-002/TA-003/TA-001 · Persistir puerto, nombre y cold start del despliegue.
            execution.setDeployPort(hostPort);
            execution.setDeployContainerName(containerName);
            execution.setColdStartMs(coldStartMs);
            execution.setDeployStatus(healthy ? "SUCCESS" : "FAILED");   // TA-004/TEL-02
            executionRepository.save(execution);

            if (!healthy) {
                // Captura el log del contenedor para mostrar la causa real (no solo "timeout").
                String tail = dockerFacade.tailContainerLogs(containerId, 40);
                if (tail != null && !tail.isBlank()) {
                    executionEventBus.publish(execId, "ERROR",
                            "Log del model-service:\n" + tail.strip());
                }
                dockerFacade.stopContainer(containerId);
                executionEventBus.publish(execId, "ERROR",
                        "Despliegue FALLIDO: el model-service no respondió al health check ("
                                + coldStartMs + " ms). Contenedor detenido. Revisa el log de arriba.",
                        true);   // terminal: fin del ciclo (despliegue fallido)
                return new DeploymentResponse(executionId, containerId, modelName,
                        artifact.getModelVersion(), "http://localhost:" + hostPort, "FAILED");
            }

            executionEventBus.publish(execId, "INFO",
                    "model-service desplegado y healthy en :" + hostPort
                            + " (cold start " + coldStartMs + " ms). Endpoint /predict disponible.",
                    true);   // terminal: fin del ciclo (despliegue exitoso)

            return new DeploymentResponse(
                    executionId,
                    containerId,
                    modelName,
                    artifact.getModelVersion(),
                    "http://localhost:" + hostPort,
                    "RUNNING"
            );

        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<DeploymentResponse> getDeploymentStatus(Long executionId,
                                                        String username) {
        return Mono.fromCallable(() -> {
            PipelineExecution execution = executionRepository.findByIdWithDetails(executionId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Ejecución no encontrada: " + executionId));

            if (!execution.getPipeline().getWorkspace()
                    .getUser().getUsername().equals(username)) {
                throw new AccessDeniedException("Sin permisos.");
            }

            MLArtifact artifact = execution.getArtifact();
            if (artifact == null) {
                return new DeploymentResponse(executionId, null, null,
                        null, null, "NOT_DEPLOYED");
            }

            String hyperparams = artifact.getHyperparameters();
            String containerId = extractContainerId(hyperparams);

            boolean running = containerId != null &&
                    dockerFacade.healthCheck(containerId);

            int port = execution.getDeployPort() != null ? execution.getDeployPort() : 8000;
            return new DeploymentResponse(
                    executionId,
                    containerId,
                    artifact.getModelVersion(),
                    artifact.getModelVersion(),
                    "http://localhost:" + port,
                    running ? "RUNNING" : "STOPPED"
            );
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<Void> undeploy(Long executionId, String username) {
        return Mono.fromRunnable(() -> {
            PipelineExecution execution = executionRepository.findByIdWithDetails(executionId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Ejecución no encontrada: " + executionId));

            if (!execution.getPipeline().getWorkspace()
                    .getUser().getUsername().equals(username)) {
                throw new AccessDeniedException("Sin permisos.");
            }

            // Se derriba por NOMBRE de contenedor (estable: modelo_{ws}). El containerId
            // almacenado puede apuntar a un contenedor ya reemplazado por un redepliegue → 404.
            String name = execution.getDeployContainerName();
            if (name != null && !name.isBlank()) {
                dockerFacade.removeContainerByName(name);
            }
            execution.setDeployStatus("STOPPED");
            executionRepository.save(execution);
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    /** Nombres de clase desde el tag confusion_matrix (labels) del run en MLflow. */
    private String resolveClassNames(String runId) {
        if (runId == null || runId.isBlank()) return "";
        try {
            Map<String, Object> summary = mlflowFacade.getRunSummary(runId)
                    .onErrorReturn(Map.of()).blockOptional().orElse(Map.of());
            if (!(summary.get("tags") instanceof Map<?, ?> tags)) return "";
            Object cm = tags.get("confusion_matrix");
            if (cm == null) return "";
            JsonNode labels = objectMapper.readTree(cm.toString()).path("labels");
            if (!labels.isArray()) return "";
            List<String> names = new ArrayList<>();
            labels.forEach(n -> names.add(n.asText()));
            return String.join(",", names);
        } catch (Exception e) {
            log.warn("No se pudieron resolver class_names (runId={}): {}", runId, e.getMessage());
            return "";
        }
    }

    /** HU-007 · Valida que el docker-compose.yml generado es YAML sintácticamente correcto. */
    private void validateComposeYaml(String yaml) {
        try {
            Object root = new Yaml().load(yaml);
            if (!(root instanceof Map<?, ?> map) || !map.containsKey("services")) {
                throw new IllegalStateException("docker-compose.yml sin clave 'services'.");
            }
        } catch (RuntimeException e) {
            throw new IllegalStateException("docker-compose.yml generado inválido: " + e.getMessage(), e);
        }
    }

    /** HU-007 · Persiste los manifiestos generados en /storage para auditoría/trazabilidad. */
    private void persistManifests(Long executionId, String dockerfile, String composeYaml) {
        try {
            Path dir = Path.of(storageBasePath, "deployments", String.valueOf(executionId));
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("Dockerfile"), dockerfile);
            Files.writeString(dir.resolve("docker-compose.yml"), composeYaml);
        } catch (IOException e) {
            log.warn("No se pudieron persistir los manifiestos de despliegue (exec={}): {}",
                    executionId, e.getMessage());
        }
    }

    @Override
    public Mono<DeploymentResponse> deployByRunId(String runId, String username) {
        return Mono.fromCallable(() -> executionRepository.findByMlflowRunId(runId)
                        .map(PipelineExecution::getIdExecution)
                        .orElseThrow(() -> new ResourceNotFoundException(
                                "No hay una ejecución asociada al run: " + runId)))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(execId -> deploy(execId, username));
    }

    @Override
    public Mono<DeploymentsView> listDeployments(String username) {
        return Mono.fromCallable(() -> {
            List<PipelineExecution> execs =
                    executionRepository.findDeploymentsByUsername(username);

            var active = dockerFacade.listModelServiceContainers();
            Set<String> runningNames = active.stream()
                    .flatMap(c -> Arrays.stream(c.getNames()))
                    .map(n -> n.startsWith("/") ? n.substring(1) : n)
                    .collect(Collectors.toSet());

            List<DeploymentItem> items = execs.stream().map(e -> {
                var ws  = e.getPipeline().getWorkspace();
                MLArtifact art = e.getArtifact();
                boolean running = e.getDeployContainerName() != null
                        && runningNames.contains(e.getDeployContainerName());
                return new DeploymentItem(
                        e.getIdExecution(),
                        ws.getIdWorkspace(),
                        ws.getName(),
                        art != null ? art.getModelVersion() : null,
                        e.getMlflowRunId(),
                        e.getDeployContainerName(),
                        e.getDeployPort(),
                        e.getDeployPort() != null ? "http://localhost:" + e.getDeployPort() : null,
                        e.getDeployStatus(),
                        e.getColdStartMs(),
                        running);
            }).toList();

            // El contenedor es por workspace (modelo_{ws}); varias ejecuciones comparten
            // nombre. Se colapsa a UNO por contenedor (el más reciente: la query viene
            // ordenada por id DESC) para no mostrar versiones "fantasma" como activas.
            Map<String, DeploymentItem> latestByContainer = new LinkedHashMap<>();
            for (DeploymentItem it : items) {
                String key = it.containerName() != null ? it.containerName() : "exec-" + it.executionId();
                latestByContainer.putIfAbsent(key, it);
            }
            return new DeploymentsView(maxDeployments, active.size(),
                    new ArrayList<>(latestByContainer.values()));
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<String> predict(Long executionId, String username, String base64Image) {
        return Mono.fromCallable(() -> {
            PipelineExecution execution = executionRepository.findByIdWithDetails(executionId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Ejecución no encontrada: " + executionId));
            if (!execution.getPipeline().getWorkspace().getUser().getUsername().equals(username)) {
                throw new AccessDeniedException("Sin permisos sobre esta ejecución.");
            }
            String name = execution.getDeployContainerName();
            if (name == null || name.isBlank()) {
                throw new IllegalStateException("Esta ejecución no tiene un model-service desplegado.");
            }
            // base64 es seguro dentro de comillas JSON (no contiene comillas ni '\').
            String body = "{\"image\":\"" + base64Image + "\"}";
            return dockerFacade.forwardJson(name, 8000, "/predict", body);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private String extractContainerId(String hyperparamsJson) {
        if (hyperparamsJson == null) return null;
        int idx = hyperparamsJson.indexOf("\"containerId\":\"");
        if (idx == -1) return null;
        int start = idx + 15;
        int end   = hyperparamsJson.indexOf("\"", start);
        return end > start ? hyperparamsJson.substring(start, end) : null;
    }
}
