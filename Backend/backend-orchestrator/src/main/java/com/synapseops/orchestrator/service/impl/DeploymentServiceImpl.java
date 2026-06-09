package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.domain.dto.response.DeploymentResponse;
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
import java.util.Map;

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

    @Value("${storage.base-path:/storage}")
    private String storageBasePath;

    @Value("${synapseops.model-service.max-deployments:3}")
    private int maxDeployments;

    @Override
    public Mono<DeploymentResponse> deploy(Long executionId, String username) {
        return Mono.fromCallable(() -> {

            PipelineExecution execution = executionRepository.findById(executionId)
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
                                + "). Derriba un model-service en 'Despliegues' antes de crear otro.");
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

            String imageId = dockerFacade.buildImage(dockerfile, serviceName, framework);
            log.info("Imagen construida: {} → {}", serviceName, imageId);

            // Contrato de la plantilla TA-007: el artefacto se lee de MODEL_PATH
            // (sobre el volumen /storage compartido montado por DockerFacade).
            Map<String, String> envVars = Map.of(
                    "MODEL_PATH", artifactPath
            );

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
            long coldStartStart = System.currentTimeMillis();
            boolean healthy = dockerFacade.waitForHttpHealthy(containerName, 8000, 5, 2000);
            long coldStartMs = System.currentTimeMillis() - coldStartStart;

            // TA-002/TA-003/TA-001 · Persistir puerto, nombre y cold start del despliegue.
            execution.setDeployPort(hostPort);
            execution.setDeployContainerName(containerName);
            execution.setColdStartMs(coldStartMs);
            execution.setDeployStatus(healthy ? "SUCCESS" : "FAILED");   // TA-004/TEL-02
            executionRepository.save(execution);

            if (!healthy) {
                dockerFacade.stopContainer(containerId);
                executionEventBus.publish(execId, "ERROR",
                        "Despliegue FALLIDO: el model-service no respondió al health check "
                                + "(5 reintentos, " + coldStartMs + " ms). Contenedor detenido.");
                return new DeploymentResponse(executionId, containerId, modelName,
                        artifact.getModelVersion(), "http://localhost:" + hostPort, "FAILED");
            }

            executionEventBus.publish(execId, "INFO",
                    "model-service desplegado y healthy en :" + hostPort
                            + " (cold start " + coldStartMs + " ms). Endpoint /predict disponible.");

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
            PipelineExecution execution = executionRepository.findById(executionId)
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
            PipelineExecution execution = executionRepository.findById(executionId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Ejecución no encontrada: " + executionId));

            if (!execution.getPipeline().getWorkspace()
                    .getUser().getUsername().equals(username)) {
                throw new AccessDeniedException("Sin permisos.");
            }

            MLArtifact artifact = execution.getArtifact();
            if (artifact == null) return;

            String containerId = extractContainerId(artifact.getHyperparameters());
            if (containerId != null) {
                dockerFacade.stopContainer(containerId);
                log.info("Contenedor detenido: {}", containerId);
            }
        }).subscribeOn(Schedulers.boundedElastic()).then();
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

    private String extractContainerId(String hyperparamsJson) {
        if (hyperparamsJson == null) return null;
        int idx = hyperparamsJson.indexOf("\"containerId\":\"");
        if (idx == -1) return null;
        int start = idx + 15;
        int end   = hyperparamsJson.indexOf("\"", start);
        return end > start ? hyperparamsJson.substring(start, end) : null;
    }
}
