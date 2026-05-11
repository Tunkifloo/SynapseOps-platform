package com.synapseops.orchestrator.infra.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.BuildImageResultCallback;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Frame;
import com.github.dockerjava.api.model.HostConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class DockerFacade {

    private final DockerClient dockerClient;

    public String buildImage(String dockerfileContent, String imageName) {
        log.info("Construyendo imagen Docker: {}", imageName);

        InputStream dockerfileStream = new ByteArrayInputStream(
                dockerfileContent.getBytes(StandardCharsets.UTF_8));

        String imageId = dockerClient.buildImageCmd(dockerfileStream)
                .withTags(Set.of(imageName + ":latest"))
                .exec(new BuildImageResultCallback())
                .awaitImageId();

        log.info("Imagen construida exitosamente. ID: {}", imageId);
        return imageId;
    }

    public String runContainer(String imageId, Map<String, String> envVars) {
        log.info("Levantando contenedor desde imagen: {}", imageId);

        List<String> envList = envVars.entrySet().stream()
                .map(e -> e.getKey() + "=" + e.getValue())
                .toList();

        String containerId = dockerClient.createContainerCmd(imageId)
                .withEnv(envList)
                .withHostConfig(HostConfig.newHostConfig()
                        .withNetworkMode("mlops-network"))
                .exec()
                .getId();

        dockerClient.startContainerCmd(containerId).exec();

        log.info("Contenedor iniciado. ID: {}", containerId);
        return containerId;
    }

    public void stopContainer(String containerId) {
        log.info("Deteniendo contenedor: {}", containerId);
        try {
            dockerClient.stopContainerCmd(containerId)
                    .withTimeout(10)
                    .exec();
            dockerClient.removeContainerCmd(containerId)
                    .withForce(true)
                    .exec();
            log.info("Contenedor detenido y eliminado: {}", containerId);
        } catch (Exception e) {
            log.warn("No se pudo detener el contenedor {}: {}", containerId, e.getMessage());
        }
    }

    public boolean healthCheck(String containerId) {
        try {
            InspectContainerResponse inspect = dockerClient
                    .inspectContainerCmd(containerId)
                    .exec();
            boolean running = Boolean.TRUE.equals(
                    inspect.getState().getRunning());
            log.info("Health check contenedor {}: {}", containerId,
                    running ? "RUNNING" : "STOPPED");
            return running;
        } catch (Exception e) {
            log.error("Health check fallido para {}: {}", containerId, e.getMessage());
            return false;
        }
    }

    public void streamContainerLogs(String containerId, SseEmitter emitter) {
        log.info("Iniciando stream de logs para contenedor: {}", containerId);

        dockerClient.logContainerCmd(containerId)
                .withFollowStream(true)
                .withStdOut(true)
                .withStdErr(true)
                .withTimestamps(true)
                .exec(new ResultCallback.Adapter<Frame>() {

                    @Override
                    public void onNext(Frame frame) {
                        String logLine = new String(
                                frame.getPayload(),
                                StandardCharsets.UTF_8).trim();

                        if (!logLine.isEmpty()) {
                            try {
                                emitter.send(SseEmitter.event()
                                        .id(String.valueOf(
                                                System.currentTimeMillis()))
                                        .name("log-event")
                                        .data(logLine)
                                        .reconnectTime(3000L));
                            } catch (IOException e) {
                                emitter.completeWithError(e);
                            }
                        }
                    }

                    @Override
                    public void onComplete() {
                        emitter.complete();
                        log.info("Stream de logs completado: {}", containerId);
                    }

                    @Override
                    public void onError(Throwable throwable) {
                        emitter.completeWithError(throwable);
                        log.error("Error en stream de logs {}: {}",
                                containerId, throwable.getMessage());
                    }
                });
    }
}