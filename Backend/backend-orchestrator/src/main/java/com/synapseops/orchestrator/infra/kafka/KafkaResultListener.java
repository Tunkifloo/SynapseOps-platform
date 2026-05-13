package com.synapseops.orchestrator.infra.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.dto.kafka.PipelineJobResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaResultListener {

    private final ObjectMapper objectMapper;

    @KafkaListener(
            topics = "mlops.pipeline.results",
            groupId = "orchestrator-group",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void onPipelineResult(
            @Payload String message,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            @Header(KafkaHeaders.OFFSET) long offset) {

        log.info("Resultado recibido desde Kafka. Partition: {} | Offset: {}",
                partition, offset);

        try {
            PipelineJobResult result = objectMapper
                    .readValue(message, PipelineJobResult.class);

            log.info("Pipeline ExecutionId: {} | Status: {} | MLflow RunId: {}",
                    result.executionId(), result.status(), result.mlflowRunId());

        } catch (Exception e) {
            log.error("Error deserializando PipelineJobResult: {}", e.getMessage());
        }
    }
}
