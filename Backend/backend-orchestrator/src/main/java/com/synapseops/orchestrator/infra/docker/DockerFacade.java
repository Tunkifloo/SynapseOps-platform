package com.synapseops.orchestrator.infra.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.BuildImageResultCallback;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Frame;
import com.github.dockerjava.api.model.HostConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.io.ByteArrayInputStream;
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
            log.info("Health check contenedor {}: {}",
                    containerId, running ? "RUNNING" : "STOPPED");
            return running;
        } catch (Exception e) {
            log.error("Health check fallido para {}: {}",
                    containerId, e.getMessage());
            return false;
        }
    }

    /**
     * Stream de logs del contenedor como Flux de ServerSentEvents.
     * El controller de Sprint 2 retorna este Flux directamente
     * con MediaType.TEXT_EVENT_STREAM_VALUE — sin bloqueos.
     *
     * Uso en controller (Sprint 2):
     *   {@code
     *   @GetMapping(value = "/logs/{id}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
     *   public Flux<ServerSentEvent<String>> streamLogs(@PathVariable String id) {
     *       return dockerFacade.streamContainerLogs(id);
     *   }
     *   }
     */
    @SuppressWarnings("unused")
    public Flux<ServerSentEvent<String>> streamContainerLogs(String containerId) {
        log.info("Iniciando stream de logs para contenedor: {}", containerId);

        return Flux.create(sink -> dockerClient.logContainerCmd(containerId)
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
                            sink.next(ServerSentEvent.<String>builder()
                                    .id(String.valueOf(System.currentTimeMillis()))
                                    .event("log-event")
                                    .data(logLine)
                                    .build());
                        }
                    }

                    @Override
                    public void onComplete() {
                        log.info("Stream de logs completado: {}", containerId);
                        sink.complete();
                    }

                    @Override
                    public void onError(Throwable throwable) {
                        log.error("Error en stream de logs {}: {}",
                                containerId, throwable.getMessage());
                        sink.error(throwable);
                    }
                }), FluxSink.OverflowStrategy.BUFFER);
    }
}