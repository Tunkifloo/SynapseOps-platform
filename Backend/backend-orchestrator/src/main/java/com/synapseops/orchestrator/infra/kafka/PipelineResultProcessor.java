package com.synapseops.orchestrator.infra.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.repository.*;
import com.synapseops.orchestrator.infra.sse.ExecutionEventBus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PipelineResultProcessor {

    private final PipelineExecutionRepository executionRepository;
    private final PipelineRepository          pipelineRepository;
    private final MLArtifactRepository        artifactRepository;
    private final ObjectMapper                objectMapper;
    private final ExecutionEventBus           executionEventBus;

    @Transactional
    public void process(String message) {
        try {
            JsonNode result    = objectMapper.readTree(message);
            String executionId = result.path("execution_id").asText();
            String status      = result.path("status").asText();

            log.info("Procesando resultado — executionId={} status={}", executionId, status);

            PipelineExecution execution = executionRepository
                    .findByIdWithDetails(Long.parseLong(executionId))
                    .orElse(null);

            if (execution == null) {
                log.error("Ejecución no encontrada: executionId={}", executionId);
                return;
            }

            // Idempotencia: Kafka es at-least-once. Si la ejecución ya está en estado
            // terminal, este resultado es una redelivery → se ignora sin reprocesar.
            if (execution.getStatus() == ExecutionStatus.COMPLETED
                    || execution.getStatus() == ExecutionStatus.FAILED) {
                log.warn("Resultado ignorado (idempotencia) — executionId={} ya en estado terminal {}",
                        executionId, execution.getStatus());
                return;
            }

            Pipeline pipeline = execution.getPipeline();

            if ("SUCCESS".equals(status)) {
                String runId           = result.path("run_id").asText();
                String modelVersion    = result.path("model_version").asText();
                String artifactPath    = result.path("artifact_path").asText("");
                String hyperparamsJson = result.path("hyperparameters").toString();
                String metricsJson     = result.path("metrics").toString();

                execution.complete(runId);
                executionRepository.save(execution);
                log.info("Ejecución COMPLETADA — id={} runId={}", executionId, runId);

                // Segunda red de seguridad: el run_id es único en BD. Si ya existe un
                // artefacto para este run (redelivery con execution aún no terminal),
                // no se inserta un duplicado que violaría la restricción unique.
                if (artifactRepository.findByRunId(runId).isPresent()) {
                    log.warn("MLArtifact duplicado ignorado — runId={} ya persistido", runId);
                } else {
                    MLArtifact artifact = new MLArtifact();
                    artifact.setRunId(runId);
                    artifact.setArtifactPath(artifactPath);
                    artifact.setModelVersion(modelVersion);
                    artifact.setHyperparameters(hyperparamsJson);
                    artifact.setMetrics(metricsJson);
                    artifact.setExecution(execution);
                    artifactRepository.save(artifact);
                    log.info("MLArtifact persistido — runId={} version={}", runId, modelVersion);
                }

                pipeline.setStatus(PipelineStatus.COMPLETED);
                pipelineRepository.save(pipeline);
                log.info("Pipeline COMPLETADO — executionId={}", executionId);

                // NO terminal: el entrenamiento es una FASE del ciclo, no su fin. Si el
                // lienzo tiene un nodo Despliegue conectado, el auto-despliegue continúa
                // publicando logs en este mismo stream SSE. Marcar terminal aquí cerraría
                // la consola antes de mostrar el despliegue. El evento terminal real lo
                // emite el despliegue (éxito/fallo) en DeploymentServiceImpl.
                executionEventBus.publish(executionId, "INFO",
                        "Entrenamiento COMPLETADO — runId=" + runId
                                + (modelVersion.isBlank() ? "" : " · versión " + modelVersion),
                        false);

            } else {
                execution.fail();
                executionRepository.save(execution);
                pipeline.setStatus(PipelineStatus.FAILED);
                pipelineRepository.save(pipeline);
                String errorMsg = result.path("error").asText("");
                log.error("Pipeline FALLIDO — executionId={} error={}", executionId, errorMsg);

                executionEventBus.publish(executionId, "ERROR",
                        "Entrenamiento FALLIDO" + (errorMsg.isBlank() ? "" : ": " + errorMsg),
                        true);
            }

        } catch (Exception e) {
            log.error("Error procesando resultado Kafka: {}", e.getMessage(), e);
            throw new RuntimeException("Error en PipelineResultProcessor", e);
        }
    }
}