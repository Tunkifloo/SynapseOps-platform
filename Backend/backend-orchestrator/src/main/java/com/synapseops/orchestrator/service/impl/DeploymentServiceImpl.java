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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

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

    @Value("${mlflow.tracking.uri:http://mlflow-server:5000}")
    private String mlflowTrackingUri;

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

            log.info("Iniciando despliegue — executionId={} model={} path={}",
                    executionId, modelName, artifactPath);

            String dockerfile = dockerfileBuilder
                    .reset()
                    .setArtifactPath(artifactPath)
                    .setModelName(modelName)
                    .setMlflowTrackingUri(mlflowTrackingUri)
                    .build();

            String imageId = dockerFacade.buildImage(dockerfile, serviceName);
            log.info("Imagen construida: {} → {}", serviceName, imageId);

            Map<String, String> envVars = Map.of(
                    "ARTIFACT_PATH",        artifactPath,
                    "MODEL_NAME",           modelName,
                    "MLFLOW_TRACKING_URI",  mlflowTrackingUri
            );

            String containerId = dockerFacade.runContainer(imageId, envVars);
            log.info("Contenedor levantado: {} → {}", serviceName, containerId);

            artifact.setHyperparameters(
                    artifact.getHyperparameters() + ",\"containerId\":\"" + containerId + "\""
            );
            artifactRepository.save(artifact);

            return new DeploymentResponse(
                    executionId,
                    containerId,
                    modelName,
                    artifact.getModelVersion(),
                    "http://localhost:8500",
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

            return new DeploymentResponse(
                    executionId,
                    containerId,
                    artifact.getModelVersion(),
                    artifact.getModelVersion(),
                    "http://localhost:8500",
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

    private String extractContainerId(String hyperparamsJson) {
        if (hyperparamsJson == null) return null;
        int idx = hyperparamsJson.indexOf("\"containerId\":\"");
        if (idx == -1) return null;
        int start = idx + 15;
        int end   = hyperparamsJson.indexOf("\"", start);
        return end > start ? hyperparamsJson.substring(start, end) : null;
    }
}
