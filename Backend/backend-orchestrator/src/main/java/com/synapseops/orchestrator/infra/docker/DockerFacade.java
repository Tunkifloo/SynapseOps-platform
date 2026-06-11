package com.synapseops.orchestrator.infra.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.BuildImageResultCallback;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Frame;
import com.github.dockerjava.api.model.Bind;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.HostConfig;
import com.github.dockerjava.api.model.Ports;
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
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
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

    /** Ruta de los artefactos dentro de los contenedores (ml-engine ↔ orchestrator ↔ model-service). */
    @Value("${storage.base-path:/storage}")
    private String storageBasePath;

    /**
     * Volumen Docker NOMBRADO que respalda /storage. DooD: el model-service debe montar
     * el mismo volumen nombrado que usan backend y ml-engine, NO un bind a la ruta /storage
     * (el daemon resolvería esa ruta contra el host, no contra el volumen → artefacto ausente).
     */
    @Value("${synapseops.model-service.storage-volume:synapseops_storage_data}")
    private String storageVolume;

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

    /**
     * TA-002 · Escanea y devuelve el primer puerto TCP libre del host a partir de
     * {@code startInclusive} (p. ej. 8001), evitando colisiones cuando varios
     * estudiantes despliegan model-services simultáneamente.
     */
    public int findFreePort(int startInclusive) {
        for (int port = startInclusive; port < startInclusive + 1000; port++) {
            try (ServerSocket socket = new ServerSocket(port)) {
                socket.setReuseAddress(true);
                return port;
            } catch (java.io.IOException ignored) {
                // puerto ocupado → siguiente
            }
        }
        throw new IllegalStateException(
                "No se encontró puerto libre desde " + startInclusive);
    }

    /**
     * TA-002 / TA-003 · Levanta el model-service con un nombre único
     * ({@code modelo_{workspaceId}}) y publica host:{@code hostPort} → contenedor:8000.
     * Elimina cualquier contenedor previo con el mismo nombre para permitir el
     * redepliegue sin conflicto.
     */
    public String runContainer(String imageId, Map<String, String> envVars,
                               String containerName, int hostPort) {
        removeContainerByName(containerName);

        List<String> envList = envVars.entrySet().stream()
                .map(e -> e.getKey() + "=" + e.getValue())
                .toList();

        ExposedPort exposed = ExposedPort.tcp(8000);
        Ports portBindings = new Ports();
        portBindings.bind(exposed, Ports.Binding.bindPort(hostPort));

        String containerId = dockerClient.createContainerCmd(imageId)
                .withName(containerName)
                .withEnv(envList)
                .withExposedPorts(exposed)
                // HU-009 · labels para que Prometheus (docker_sd) descubra y scrapee /metrics.
                .withLabels(Map.of(
                        "metrics", "true",
                        "com.synapseops.service", "model-service"))
                .withHostConfig(HostConfig.newHostConfig()
                        .withNetworkMode("mlops-network")
                        .withPortBindings(portBindings)
                        // Volumen NOMBRADO (no bind de ruta) para compartir los artefactos vía DooD.
                        .withBinds(Bind.parse(storageVolume + ":" + storageBasePath + ":ro")))
                .exec()
                .getId();

        dockerClient.startContainerCmd(containerId).exec();
        log.info("model-service '{}' levantado en :{} → {}", containerName, hostPort, containerId);
        return containerId;
    }

    /**
     * TA-004 · Contenedores model-service activos (running), identificados por el
     * label {@code metrics=true} que inyecta {@link #runContainer}. Base del tope
     * de despliegues concurrentes.
     */
    public List<Container> listModelServiceContainers() {
        try {
            return dockerClient.listContainersCmd()
                    .withShowAll(false)   // solo running
                    .withLabelFilter(Map.of("metrics", "true"))
                    .exec();
        } catch (Exception e) {
            log.warn("No se pudo listar model-services activos: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * TA-001 · Health check HTTP con reintentos contra {@code GET http://{ip}:{port}/health}
     * del model-service. Se usa la <b>IP</b> del contenedor (no su nombre): los nombres con
     * guion bajo ({@code modelo_{ws}}) no son hostnames válidos y java.net.http.HttpClient
     * los rechaza ("unsupported URI"). Devuelve true en el primer 200 OK.
     *
     * @param containerId contenedor a inspeccionar para resolver su IP.
     * @param retries     número de intentos.
     * @param backoffMs   espera fija entre intentos en ms.
     */
    public boolean waitForHttpHealthy(String containerId, int port, int retries, long backoffMs) {
        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)   // evita el upgrade h2c que h11 rechaza
                .connectTimeout(Duration.ofSeconds(2))
                .build();
        for (int attempt = 1; attempt <= retries; attempt++) {
            String ip = resolveContainerIp(containerId);
            if (ip != null && !ip.isBlank()) {
                URI uri = URI.create("http://" + ip + ":" + port + "/health");
                try {
                    HttpResponse<String> resp = client.send(
                            HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(2)).GET().build(),
                            HttpResponse.BodyHandlers.ofString());
                    if (resp.statusCode() == 200) {
                        log.info("Health check OK ({}) en intento {}/{}", uri, attempt, retries);
                        return true;
                    }
                    log.warn("Health check {} → HTTP {} (intento {}/{})",
                            uri, resp.statusCode(), attempt, retries);
                } catch (Exception e) {
                    log.warn("Health check {} sin respuesta (intento {}/{}): {}",
                            uri, attempt, retries, e.getMessage());
                }
            } else {
                log.warn("Sin IP aún para {} (intento {}/{})", containerId, attempt, retries);
            }
            if (attempt < retries) {
                try {
                    Thread.sleep(backoffMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return false;
    }

    /**
     * Reenvía un POST JSON al model-service (por su IP interna) y devuelve el body.
     * Usado como proxy del /predict desde la UI (evita CORS y mantiene el servicio interno).
     */
    public String forwardJson(String containerNameOrId, int port, String path, String jsonBody) {
        String ip = resolveContainerIp(containerNameOrId);
        if (ip == null || ip.isBlank()) {
            throw new IllegalStateException("model-service no alcanzable: " + containerNameOrId);
        }
        // HTTP/1.1 forzado: el cliente JDK por defecto negocia HTTP/2 vía upgrade h2c
        // en texto plano, que uvicorn/h11 rechaza con "400 Invalid HTTP request received"
        // (visible en los logs del model-service al hacer POST /predict). Forzar 1.1 evita
        // el upgrade. Aplica a ambos frameworks (TF y PyTorch comparten este servidor).
        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        try {
            HttpResponse<String> resp = client.send(
                    HttpRequest.newBuilder(URI.create("http://" + ip + ":" + port + path))
                            .timeout(Duration.ofSeconds(30))
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                throw new IllegalStateException(
                        "model-service respondió HTTP " + resp.statusCode() + ": " + resp.body());
            }
            return resp.body();
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Error llamando al model-service: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Llamada al model-service interrumpida", e);
        }
    }

    /** IP del contenedor en mlops-network (o la primera red disponible). */
    public String resolveContainerIp(String containerId) {
        try {
            var settings = dockerClient.inspectContainerCmd(containerId).exec().getNetworkSettings();
            if (settings == null || settings.getNetworks() == null || settings.getNetworks().isEmpty()) {
                return null;
            }
            var networks = settings.getNetworks();
            var net = networks.getOrDefault("mlops-network", networks.values().iterator().next());
            return net != null ? net.getIpAddress() : null;
        } catch (Exception e) {
            log.warn("No se pudo resolver IP del contenedor {}: {}", containerId, e.getMessage());
            return null;
        }
    }

    /**
     * Lee (best-effort) las últimas {@code tail} líneas de logs de un contenedor.
     * Se usa para mostrar al usuario por qué falló el arranque del model-service.
     */
    public String tailContainerLogs(String containerId, int tail) {
        StringBuilder sb = new StringBuilder();
        try {
            dockerClient.logContainerCmd(containerId)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withTail(tail)
                    .exec(new ResultCallback.Adapter<Frame>() {
                        @Override
                        public void onNext(Frame frame) {
                            sb.append(new String(frame.getPayload(), StandardCharsets.UTF_8));
                        }
                    })
                    .awaitCompletion(5, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("No se pudieron leer logs del contenedor {}: {}", containerId, e.getMessage());
        }
        return sb.toString();
    }

    /** Elimina (best-effort) un contenedor existente por nombre (redepliegue/derribo). */
    public void removeContainerByName(String name) {
        try {
            dockerClient.listContainersCmd()
                    .withShowAll(true)
                    .withNameFilter(List.of(name))
                    .exec()
                    .forEach(c -> {
                        try {
                            dockerClient.removeContainerCmd(c.getId()).withForce(true).exec();
                            log.info("Contenedor previo '{}' eliminado para redepliegue.", name);
                        } catch (Exception e) {
                            log.warn("No se pudo eliminar contenedor previo {}: {}", name, e.getMessage());
                        }
                    });
        } catch (Exception e) {
            log.warn("No se pudo listar contenedores para limpiar '{}': {}", name, e.getMessage());
        }
    }

    public void stopContainer(String containerId) {
        log.info("Derribando contenedor: {}", containerId);
        // Stop y remove en bloques independientes: si el contenedor YA está detenido
        // (p. ej. crasheó), el stop lanza excepción; eso NO debe impedir el remove.
        try {
            dockerClient.stopContainerCmd(containerId).withTimeout(10).exec();
        } catch (Exception e) {
            log.debug("Stop no aplicable para {} (¿ya detenido?): {}", containerId, e.getMessage());
        }
        try {
            // withForce elimina el contenedor esté corriendo o detenido.
            dockerClient.removeContainerCmd(containerId).withForce(true).exec();
            log.info("Contenedor eliminado: {}", containerId);
        } catch (Exception e) {
            log.warn("No se pudo eliminar el contenedor {}: {}", containerId, e.getMessage());
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