package com.synapseops.orchestrator.infra.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.repository.*;
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

    @Transactional
    public void process(String message) {
        try {
            JsonNode result    = objectMapper.readTree(message);
            String executionId = result.path("execution_id").asText();
            String status      = result.path("status").asText();

            log.info("Procesando resultado — executionId={} status={}", executionId, status);

            PipelineExecution execution = executionRepository
                    .findById(Long.parseLong(executionId))
                    .orElse(null);

            if (execution == null) {
                log.error("Ejecución no encontrada: executionId={}", executionId);
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

                MLArtifact artifact = new MLArtifact();
                artifact.setRunId(runId);
                artifact.setArtifactPath(artifactPath);
                artifact.setModelVersion(modelVersion);
                artifact.setHyperparameters(hyperparamsJson);
                artifact.setMetrics(metricsJson);
                artifact.setExecution(execution);
                artifactRepository.save(artifact);
                log.info("MLArtifact persistido — version={}", modelVersion);

                pipeline.setStatus(PipelineStatus.COMPLETED);
                pipelineRepository.save(pipeline);

            } else {
                execution.fail();
                executionRepository.save(execution);
                pipeline.setStatus(PipelineStatus.FAILED);
                pipelineRepository.save(pipeline);
                log.error("Pipeline FALLIDO — executionId={} error={}",
                        executionId, result.path("error").asText());
            }

        } catch (Exception e) {
            log.error("Error procesando resultado Kafka: {}", e.getMessage(), e);
            throw new RuntimeException("Rollback — error en PipelineResultProcessor", e);
        }
    }
}