package com.synapseops.orchestrator.infra.mlflow;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

@Slf4j
@Component
public class MLflowFacade {

    private final WebClient webClient;
    @Getter
    private final String trackingUri;

    public MLflowFacade(
            @Value("${mlflow.tracking.uri}") String mlflowUri) {
        this.trackingUri = mlflowUri;
        this.webClient = WebClient.builder()
                .baseUrl(mlflowUri)
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public Mono<String> createExperiment(String name) {
        return webClient.post()
                .uri("/api/2.0/mlflow/experiments/create")
                .bodyValue(Map.of("name", name))
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(r -> r.path("experiment_id").asText())
                .doOnSuccess(id ->
                        log.info("Experimento creado en MLflow. ID: {}", id))
                .doOnError(e ->
                        log.error("Error creando experimento MLflow: {}", e.getMessage()));
    }

    public Mono<String> getArtifactUri(String runId) {
        return webClient.get()
                .uri(uri -> uri
                        .path("/api/2.0/mlflow/runs/get")
                        .queryParam("run_id", runId)
                        .build())
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(r -> r.path("run")
                        .path("info")
                        .path("artifact_uri").asText())
                .doOnSuccess(uri ->
                        log.info("Artifact URI obtenido. RunId: {} → {}", runId, uri))
                .doOnError(e ->
                        log.error("Error obteniendo artifact URI para RunId {}: {}",
                                runId, e.getMessage()));
    }

    public Mono<MlflowRunMetrics> getRunMetrics(String runId) {
        return webClient.get()
                .uri(uri -> uri
                        .path("/api/2.0/mlflow/runs/get")
                        .queryParam("run_id", runId)
                        .build())
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(r -> {
                    JsonNode data = r.path("run").path("data");
                    return new MlflowRunMetrics(
                            extractMetric(data, "accuracy"),
                            extractMetric(data, "loss"),
                            extractMetric(data, "val_accuracy")
                    );
                });
    }

    public Mono<String> registerModel(String runId, String modelName) {
        String modelUri = "runs:/" + runId + "/model";
        return webClient.post()
                .uri("/api/2.0/mlflow/registered-models/create")
                .bodyValue(Map.of("name", modelName))
                .retrieve()
                .bodyToMono(JsonNode.class)
                .flatMap(r -> webClient.post()
                        .uri("/api/2.0/mlflow/model-versions/create")
                        .bodyValue(Map.of(
                                "name", modelName,
                                "source", modelUri,
                                "run_id", runId
                        ))
                        .retrieve()
                        .bodyToMono(JsonNode.class))
                .map(r -> r.path("model_version").path("version").asText())
                .doOnSuccess(v ->
                        log.info("Modelo registrado: {} → versión {}", modelName, v));
    }

    public Mono<Boolean> isReachable() {
        return webClient.get()
                .uri("/health")
                .retrieve()
                .bodyToMono(String.class)
                .map(r -> true)
                .onErrorReturn(false)
                .doOnSuccess(ok ->
                        log.info("MLflow health check: {}", ok ? "OK" : "UNREACHABLE"));
    }

    private double extractMetric(JsonNode data, String metricName) {
        JsonNode metrics = data.path("metrics");
        if (metrics.isArray()) {
            for (JsonNode m : metrics) {
                if (metricName.equals(m.path("key").asText())) {
                    return m.path("value").asDouble();
                }
            }
        }
        return 0.0;
    }
}