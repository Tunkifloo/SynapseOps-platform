package com.synapseops.orchestrator.infra.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.BuildImageResultCallback;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Frame;
import com.github.dockerjava.api.model.Bind;
import com.github.dockerjava.api.model.HostConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class DockerFacade {

    private final DockerClient dockerClient;

    /** Directorio de la plantilla del model-service (TA-007), montado como volumen. */
    @Value("${synapseops.model-service.template-dir:/app/model-service-template}")
    private String templateDir;

    /** Volumen compartido donde residen los artefactos entrenados (ml-engine ↔ orchestrator). */
    @Value("${storage.base-path:/storage}")
    private String storageBasePath;

    /**
     * Construye la imagen del model-service desde la plantilla TA-007.
     *
     * @param dockerfileContent contenido del Dockerfile (de {@code DockerfileBuilder}).
     * @param imageName         tag de la imagen.
     * @param framework         {@code tf} o {@code torch}; inyectado como {@code --build-arg FRAMEWORK}
     *                          para seleccionar el {@code requirements-<fw>.txt} correcto.
     */
    public String buildImage(String dockerfileContent, String imageName, String framework) {
        log.info("Construyendo imagen Docker: {} (framework={})", imageName, framework);
        try {
            byte[] tarBytes = buildContextTar(dockerfileContent);
            InputStream tarStream = new ByteArrayInputStream(tarBytes);

            String imageId = dockerClient.buildImageCmd(tarStream)
                    .withBuildArg("FRAMEWORK", framework)
                    .withTags(Set.of(imageName + ":latest"))
                    .exec(new BuildImageResultCallback())
                    .awaitImageId();

            log.info("Imagen construida: {} → {}", imageName, imageId);
            return imageId;
        } catch (IOException e) {
            throw new IllegalStateException("Error construyendo imagen Docker: "
                    + e.getMessage(), e);
        }
    }

    /**
     * Empaqueta el contexto de build: el Dockerfile recibido + los archivos estáticos
     * de la plantilla TA-007 ({@code server.py}, {@code requirements-base.txt} y ambos
     * {@code requirements-<fw>.txt}) leídos desde {@link #templateDir} (filesystem).
     */
    private byte[] buildContextTar(String dockerfileContent) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (TarArchiveOutputStream tar = new TarArchiveOutputStream(baos)) {
            tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_GNU);

            addToTar(tar, "Dockerfile",
                    dockerfileContent.getBytes(StandardCharsets.UTF_8));

            // Archivos copiados por el Dockerfile de la plantilla (ambos requirements
            // de framework, porque el COPY los referencia con un ARG).
            for (String file : List.of("server.py", "requirements-base.txt",
                    "requirements-tf.txt", "requirements-torch.txt")) {
                addToTar(tar, file, Files.readAllBytes(Path.of(templateDir, file)));
            }
        }
        return baos.toByteArray();
    }

    private void addToTar(TarArchiveOutputStream tar, String filename,
                          byte[] content) throws IOException {
        TarArchiveEntry entry = new TarArchiveEntry(filename);
        entry.setSize(content.length);
        tar.putArchiveEntry(entry);
        tar.write(content);
        tar.closeArchiveEntry();
    }

    public String runContainer(String imageId, Map<String, String> envVars) {
        log.info("Levantando contenedor desde imagen: {}", imageId);

        List<String> envList = envVars.entrySet().stream()
                .map(e -> e.getKey() + "=" + e.getValue())
                .toList();

        // Monta el volumen de artefactos compartido para que el model-service pueda
        // leer el modelo en MODEL_PATH (mismo /storage que escribe el ml-engine).
        String containerId = dockerClient.createContainerCmd(imageId)
                .withEnv(envList)
                .withHostConfig(HostConfig.newHostConfig()
                        .withNetworkMode("mlops-network")
                        .withBinds(Bind.parse(storageBasePath + ":" + storageBasePath + ":ro")))
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