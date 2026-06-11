package com.synapseops.orchestrator.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.dto.response.ByModelView;
import com.synapseops.orchestrator.domain.dto.response.LifecycleMetricRow;
import com.synapseops.orchestrator.domain.dto.response.LifecycleMetricsResponse;
import com.synapseops.orchestrator.domain.dto.response.ModelMetrics;
import com.synapseops.orchestrator.domain.entity.ExecutionStatus;
import com.synapseops.orchestrator.domain.entity.MLArtifact;
import com.synapseops.orchestrator.domain.entity.PipelineExecution;
import com.synapseops.orchestrator.infra.repository.PipelineExecutionRepository;
import com.synapseops.orchestrator.service.TelemetryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalDouble;
import java.util.stream.Stream;

/**
 * Cálculo de los indicadores de "Process (Lifecycle)" (OE4) a partir de los timestamps del
 * Process Tracker (TEL-01). Los builders operan sobre una lista de ejecuciones, reutilizados
 * tanto por el alcance de usuario (Monitoreo) como por el global (Analítica, ADMIN).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelemetryServiceImpl implements TelemetryService {

    private final PipelineExecutionRepository executionRepository;
    private final ObjectMapper objectMapper;

    // ── Monitoreo (usuario) ─────────────────────────────────────────────────────

    @Override
    public Mono<LifecycleMetricsResponse> lifecycleMetrics(String username) {
        return Mono.fromCallable(() ->
                buildLifecycle(executionRepository.findAllByUsernameWithDetails(username)))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<String> lifecycleCsv(String username) {
        return lifecycleMetrics(username).map(this::toCsv);
    }

    @Override
    public Mono<ByModelView> byModelMetrics(String username) {
        return Mono.fromCallable(() ->
                buildByModel(executionRepository.findAllByUsernameWithDetails(username)))
                .subscribeOn(Schedulers.boundedElastic());
    }

    // ── Analítica (global · ADMIN) ──────────────────────────────────────────────

    @Override
    public Mono<LifecycleMetricsResponse> globalLifecycleMetrics() {
        return Mono.fromCallable(() -> buildLifecycle(executionRepository.findAllWithDetails()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<ByModelView> globalByModelMetrics() {
        return Mono.fromCallable(() -> buildByModel(executionRepository.findAllWithDetails()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<String> globalLifecycleCsv() {
        return globalLifecycleMetrics().map(this::toCsv);
    }

    // ── Builders (sobre una lista de ejecuciones) ───────────────────────────────

    private LifecycleMetricsResponse buildLifecycle(List<PipelineExecution> execs) {
        List<LifecycleMetricRow> rows = execs.stream().map(this::toRow).toList();

        long completed = execs.stream().filter(e -> e.getStatus() == ExecutionStatus.COMPLETED).count();
        long failed    = execs.stream().filter(e -> e.getStatus() == ExecutionStatus.FAILED).count();
        long terminal  = completed + failed;
        long deployTotal   = execs.stream().filter(e -> e.getDeployStatus() != null).count();
        long deploySuccess = execs.stream().filter(e -> "SUCCESS".equals(e.getDeployStatus())).count();

        return new LifecycleMetricsResponse(
                execs.size(),
                terminal == 0 ? null : round1(100.0 * completed / terminal),
                deployTotal == 0 ? null : round1(100.0 * deploySuccess / deployTotal),
                avg(rows.stream().map(LifecycleMetricRow::tRetrainSeconds)),
                avg(rows.stream().map(LifecycleMetricRow::leadTimeDeploySeconds)),
                avg(rows.stream().map(r -> r.coldStartMs() == null ? null : r.coldStartMs().doubleValue())),
                avg(rows.stream().map(r -> r.interactionEffort() == null ? null : r.interactionEffort().doubleValue())),
                rows);
    }

    private ByModelView buildByModel(List<PipelineExecution> execs) {
        // Agrupa por nombre de modelo conservando el orden (ejecuciones vienen por id DESC).
        Map<String, List<PipelineExecution>> byModel = new LinkedHashMap<>();
        for (PipelineExecution e : execs) {
            String key = (e.getModelName() == null || e.getModelName().isBlank())
                    ? "(sin nombre)" : e.getModelName();
            byModel.computeIfAbsent(key, k -> new ArrayList<>()).add(e);
        }

        List<ModelMetrics> models = new ArrayList<>();
        for (var entry : byModel.entrySet()) {
            List<PipelineExecution> group = entry.getValue();
            long completed = group.stream().filter(e -> e.getStatus() == ExecutionStatus.COMPLETED).count();
            long failed    = group.stream().filter(e -> e.getStatus() == ExecutionStatus.FAILED).count();
            long terminal  = completed + failed;
            long deployTotal   = group.stream().filter(e -> e.getDeployStatus() != null).count();
            long deploySuccess = group.stream().filter(e -> "SUCCESS".equals(e.getDeployStatus())).count();
            PipelineExecution latest = group.get(0);   // id DESC → el más reciente

            models.add(new ModelMetrics(
                    entry.getKey(),
                    latest.getPipeline().getWorkspace().getName(),
                    group.size(),
                    completed,
                    failed,
                    terminal == 0 ? null : round1(100.0 * completed / terminal),
                    deployTotal == 0 ? null : round1(100.0 * deploySuccess / deployTotal),
                    avg(group.stream().map(e -> seconds(e.getIngestionStartedAt(), e.getTrainingFinishedAt()))),
                    avg(group.stream().map(e -> seconds(e.getModelApprovedAt(), e.getDeployAvailableAt()))),
                    avg(group.stream().map(e -> e.getColdStartMs() == null ? null : e.getColdStartMs().doubleValue())),
                    max(group.stream().map(this::accuracy)),
                    avg(group.stream().map(e -> {
                        Integer n = nodeCount(e.getPipeline().getCanvasJson());
                        return n == null ? null : n.doubleValue();
                    })),
                    latest.getIdExecution()));
        }
        return new ByModelView(models.size(), models);
    }

    private String toCsv(LifecycleMetricsResponse view) {
        StringBuilder sb = new StringBuilder(
                "execution_id,workspace,pipeline,model,status,t_re_seconds,lt_d_seconds,"
                        + "cold_start_ms,deploy_status,interaction_effort\n");
        for (LifecycleMetricRow r : view.rows()) {
            sb.append(r.executionId()).append(',')
                    .append(csv(r.workspaceName())).append(',')
                    .append(csv(r.pipelineName())).append(',')
                    .append(csv(r.modelName())).append(',')
                    .append(csv(r.status())).append(',')
                    .append(num(r.tRetrainSeconds())).append(',')
                    .append(num(r.leadTimeDeploySeconds())).append(',')
                    .append(r.coldStartMs() == null ? "" : r.coldStartMs()).append(',')
                    .append(csv(r.deployStatus())).append(',')
                    .append(r.interactionEffort() == null ? "" : r.interactionEffort())
                    .append('\n');
        }
        return sb.toString();
    }

    // ── Mapeo y cálculo por ejecución ───────────────────────────────────────────

    private LifecycleMetricRow toRow(PipelineExecution e) {
        var ws = e.getPipeline().getWorkspace();
        return new LifecycleMetricRow(
                e.getIdExecution(),
                ws.getName(),
                e.getPipeline().getName(),
                e.getModelName(),
                e.getStatus().name(),
                seconds(e.getIngestionStartedAt(), e.getTrainingFinishedAt()),   // T_re
                seconds(e.getModelApprovedAt(), e.getDeployAvailableAt()),       // LT_d
                e.getColdStartMs(),
                e.getDeployStatus(),
                nodeCount(e.getPipeline().getCanvasJson()));
    }

    /** Mejor accuracy del artefacto (val_accuracy > final_accuracy > accuracy); null si no hay. */
    private Double accuracy(PipelineExecution e) {
        MLArtifact a = e.getArtifact();
        if (a == null || a.getMetrics() == null || a.getMetrics().isBlank()) {
            return null;
        }
        try {
            JsonNode m = objectMapper.readTree(a.getMetrics());
            for (String k : new String[]{"val_accuracy", "final_accuracy", "accuracy"}) {
                if (m.has(k) && m.get(k).isNumber()) {
                    return round4(m.get(k).asDouble());
                }
            }
        } catch (Exception ex) {
            log.debug("Métricas no parseables (exec={}): {}", e.getIdExecution(), ex.getMessage());
        }
        return null;
    }

    /** Diferencia en segundos (1 decimal) entre dos marcas; null si falta alguna o es negativa. */
    private Double seconds(LocalDateTime from, LocalDateTime to) {
        if (from == null || to == null) {
            return null;
        }
        long ms = Duration.between(from, to).toMillis();
        return ms < 0 ? null : round1(ms / 1000.0);
    }

    /** Esfuerzo de Interacción: nº de nodos del lienzo low-code (null si no hay lienzo). */
    private Integer nodeCount(String canvasJson) {
        if (canvasJson == null || canvasJson.isBlank()) {
            return null;
        }
        try {
            JsonNode nodes = objectMapper.readTree(canvasJson).path("nodes");
            return nodes.isArray() ? nodes.size() : null;
        } catch (Exception ex) {
            log.debug("Lienzo no parseable para esfuerzo de interacción: {}", ex.getMessage());
            return null;
        }
    }

    private static Double avg(Stream<Double> values) {
        OptionalDouble avg = values.filter(v -> v != null).mapToDouble(Double::doubleValue).average();
        return avg.isPresent() ? round1(avg.getAsDouble()) : null;
    }

    private static Double max(Stream<Double> values) {
        OptionalDouble max = values.filter(v -> v != null).mapToDouble(Double::doubleValue).max();
        return max.isPresent() ? round4(max.getAsDouble()) : null;
    }

    private static String num(Double v) {
        return v == null ? "" : String.valueOf(v);
    }

    /** Escape CSV mínimo (comillas si hay coma/comilla/salto). */
    private static String csv(String v) {
        if (v == null) {
            return "";
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n")) {
            return '"' + v.replace("\"", "\"\"") + '"';
        }
        return v;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}
