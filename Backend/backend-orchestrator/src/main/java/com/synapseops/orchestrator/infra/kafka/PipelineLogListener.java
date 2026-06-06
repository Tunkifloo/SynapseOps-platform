package com.synapseops.orchestrator.infra.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.infra.sse.ExecutionEventBus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Consume los logs/progreso por epoch que publica el ml-engine en
 * `mlops.pipeline.logs` y los reenvía al bus de eventos para el stream SSE (HU-023).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PipelineLogListener {

    private final ExecutionEventBus executionEventBus;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "mlops.pipeline.logs", groupId = "orchestrator-logs-group")
    public void onLog(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            String executionId = node.path("execution_id").asText();
            String level = node.path("level").asText("INFO");
            String text = node.path("message").asText("");
            if (!executionId.isBlank() && !text.isBlank()) {
                executionEventBus.publish(executionId, level, text);
            }
        } catch (Exception e) {
            log.warn("Log de pipeline inválido, se descarta: {}", e.getMessage());
        }
    }
}
