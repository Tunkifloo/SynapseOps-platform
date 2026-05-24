package com.synapseops.orchestrator.infra.mlflow;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class MLflowFacade {

    private final WebClient    webClient;
    private final ObjectMapper objectMapper;
    @Getter
    private final String       trackingUri;

    public MLflowFacade(
            @Value("${mlflow.tracking.uri}") String mlflowUri,
            ObjectMapper objectMapper) {
        this.trackingUri  = mlflowUri;
        this.objectMapper = objectMapper;
        this.webClient    = WebClient.builder()
                .baseUrl(mlflowUri)
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public Mono<Boolean> isReachable() {
        return webClient.get()
                .uri("/health")
                .retrieve()
                .bodyToMono(String.class)
                .map(r -> true)
                .onErrorReturn(false)
                .doOnSuccess(ok -> log.info("MLflow health: {}", ok ? "OK" : "UNREACHABLE"));
    }

    public Mono<List<Map<String, Object>>> listExperiments() {
        return webClient.post()
                .uri("/api/2.0/mlflow/experiments/search")
                .bodyValue(Map.of("max_results", 100))
                .retrieve()
                .bodyToMono(String.class)
                .map(this::parseExperiments)
                .onErrorResume(e -> {
                    log.error("Error listando experimentos: {}", e.getMessage());
                    return Mono.just(List.of());
                });
    }

    private List<Map<String, Object>> parseExperiments(String json) {
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode experiments = root.path("experiments");
            if (experiments.isArray()) {
                for (JsonNode exp : experiments) {
                    Map<String, Object> e = new HashMap<>();
                    e.put("experimentId",   exp.path("experiment_id").asText());
                    e.put("name",           exp.path("name").asText());
                    e.put("lifecycleStage", exp.path("lifecycle_stage").asText("active"));
                    result.add(e);
                }
            }
        } catch (Exception e) {
            log.error("Error parseando experimentos: {}", e.getMessage());
        }
        return result;
    }

    public Mono<List<Map<String, Object>>> listRegisteredModels() {
        return webClient.get()
                .uri("/api/2.0/mlflow/registered-models/search?max_results=50")
                .retrieve()
                .bodyToMono(String.class)
                .map(this::parseRegisteredModels)
                .onErrorResume(e -> {
                    log.error("Error listando modelos registrados: {}", e.getMessage());
                    return Mono.just(new ArrayList<>());
                });
    }

    private List<Map<String, Object>> parseRegisteredModels(String json) {
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            JsonNode root   = objectMapper.readTree(json);
            JsonNode models = root.path("registered_models");
            if (models.isArray()) {
                for (JsonNode m : models) {
                    JsonNode latestVersions = m.path("latest_versions");
                    String latestVersion = "—";
                    String latestRunId   = "—";
                    if (latestVersions.isArray() && latestVersions.size() > 0) {
                        JsonNode lv  = latestVersions.get(latestVersions.size() - 1);
                        latestVersion = lv.path("version").asText("—");
                        latestRunId   = lv.path("run_id").asText("—");
                    }
                    Map<String, Object> model = new HashMap<>();
                    model.put("name",          m.path("name").asText());
                    model.put("latestVersion", latestVersion);
                    model.put("latestRunId",   latestRunId);
                    result.add(model);
                }
            }
        } catch (Exception e) {
            log.error("Error parseando modelos: {}", e.getMessage());
        }
        return result;
    }

    public Mono<List<Map<String, Object>>> getModelVersions(String modelName) {
        return webClient.get()
                .uri(uri -> uri
                        .path("/api/2.0/mlflow/model-versions/search")
                        .queryParam("filter", "name='" + modelName + "'")
                        .queryParam("max_results", 20)
                        .build())
                .retrieve()
                .bodyToMono(String.class)
                .map(this::parseModelVersions)
                .onErrorResume(e -> {
                    log.error("Error obteniendo versiones de {}: {}", modelName, e.getMessage());
                    return Mono.just(List.of());
                });
    }

    private List<Map<String, Object>> parseModelVersions(String json) {
        List<Map<String, Object>> result = new ArrayList<>();
        try {
            JsonNode root     = objectMapper.readTree(json);
            JsonNode versions = root.path("model_versions");
            if (versions.isArray()) {
                for (JsonNode v : versions) {
                    Map<String, Object> ver = new HashMap<>();
                    ver.put("version", v.path("version").asText());
                    ver.put("runId",   v.path("run_id").asText());
                    ver.put("status",  v.path("status").asText());
                    ver.put("stage",   v.path("current_stage").asText("None"));
                    result.add(ver);
                }
            }
        } catch (Exception e) {
            log.error("Error parseando versiones: {}", e.getMessage());
        }
        return result;
    }

    public Mono<String> getArtifactUri(String runId) {
        return webClient.get()
                .uri(uri -> uri
                        .path("/api/2.0/mlflow/runs/get")
                        .queryParam("run_id", runId)
                        .build())
                .retrieve()
                .bodyToMono(String.class)
                .map(json -> {
                    try {
                        return objectMapper.readTree(json)
                                .path("run").path("info").path("artifact_uri").asText();
                    } catch (Exception e) { return ""; }
                })
                .doOnSuccess(uri -> log.info("Artifact URI → runId={}: {}", runId, uri))
                .doOnError(e  -> log.error("Error artifact URI runId={}: {}", runId, e.getMessage()));
    }

    public Mono<MlflowRunMetrics> getRunMetrics(String runId) {
        return webClient.get()
                .uri(uri -> uri
                        .path("/api/2.0/mlflow/runs/get")
                        .queryParam("run_id", runId)
                        .build())
                .retrieve()
                .bodyToMono(String.class)
                .map(json -> {
                    try {
                        JsonNode data = objectMapper.readTree(json)
                                .path("run").path("data");
                        return new MlflowRunMetrics(
                                extractMetric(data, "accuracy"),
                                extractMetric(data, "loss"),
                                extractMetric(data, "val_accuracy"));
                    } catch (Exception e) {
                        return new MlflowRunMetrics(0, 0, 0);
                    }
                });
    }

    public Mono<Map<String, Object>> getRunSummary(String runId) {
        return webClient.get()
                .uri(uri -> uri
                        .path("/api/2.0/mlflow/runs/get")
                        .queryParam("run_id", runId)
                        .build())
                .retrieve()
                .bodyToMono(String.class)
                .map(json -> {
                    try {
                        JsonNode root = objectMapper.readTree(json);
                        JsonNode info = root.path("run").path("info");
                        JsonNode data = root.path("run").path("data");

                        Map<String, Double> metrics = new HashMap<>();
                        if (data.path("metrics").isArray()) {
                            for (JsonNode m : data.path("metrics"))
                                metrics.put(m.path("key").asText(), m.path("value").asDouble());
                        }
                        Map<String, String> params = new HashMap<>();
                        if (data.path("params").isArray()) {
                            for (JsonNode p : data.path("params"))
                                params.put(p.path("key").asText(), p.path("value").asText());
                        }
                        return Map.of(
                                "runId",       info.path("run_id").asText(),
                                "status",      info.path("status").asText(),
                                "artifactUri", info.path("artifact_uri").asText(),
                                "metrics",     metrics,
                                "params",      params
                        );
                    } catch (Exception e) {
                        return Map.of("error", e.getMessage());
                    }
                });
    }

    public Mono<String> createExperiment(String name) {
        return webClient.post()
                .uri("/api/2.0/mlflow/experiments/create")
                .bodyValue(Map.of("name", name))
                .retrieve()
                .bodyToMono(String.class)
                .map(json -> {
                    try { return objectMapper.readTree(json).path("experiment_id").asText(); }
                    catch (Exception e) { return ""; }
                });
    }

    public Mono<String> registerModel(String runId, String modelName) {
        return webClient.post()
                .uri("/api/2.0/mlflow/registered-models/create")
                .bodyValue(Map.of("name", modelName))
                .retrieve()
                .bodyToMono(String.class)
                .onErrorResume(e -> Mono.just("{}"))
                .flatMap(r -> webClient.post()
                        .uri("/api/2.0/mlflow/model-versions/create")
                        .bodyValue(Map.of(
                                "name",   modelName,
                                "source", "runs:/" + runId + "/model",
                                "run_id", runId))
                        .retrieve()
                        .bodyToMono(String.class))
                .map(json -> {
                    try { return objectMapper.readTree(json)
                            .path("model_version").path("version").asText(); }
                    catch (Exception e) { return ""; }
                });
    }

    private double extractMetric(JsonNode data, String key) {
        JsonNode metrics = data.path("metrics");
        if (metrics.isArray()) {
            for (JsonNode m : metrics)
                if (key.equals(m.path("key").asText())) return m.path("value").asDouble();
        }
        return 0.0;
    }
}