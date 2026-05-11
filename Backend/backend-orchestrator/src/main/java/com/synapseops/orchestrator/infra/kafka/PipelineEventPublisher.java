package com.synapseops.orchestrator.infra.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PipelineEventPublisher {

    private static final String TOPIC_REQUESTS = "mlops.pipeline.requests";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper                  objectMapper;

    public void publishPipelineJob(PipelineJobRequest request) {
        try {
            String payload = objectMapper.writeValueAsString(request);

            kafkaTemplate.send(TOPIC_REQUESTS, request.executionId(), payload)
                    .whenComplete((result, ex) -> {
                        if (ex != null) {
                            log.error("Error publicando job [{}] en Kafka: {}",
                                    request.executionId(), ex.getMessage());
                        } else {
                            log.info("Job publicado en Kafka. ExecutionId: {} | " +
                                            "Partition: {} | Offset: {}",
                                    request.executionId(),
                                    result.getRecordMetadata().partition(),
                                    result.getRecordMetadata().offset());
                        }
                    });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Error serializando PipelineJobRequest: "
                    + e.getMessage());
        }
    }
}