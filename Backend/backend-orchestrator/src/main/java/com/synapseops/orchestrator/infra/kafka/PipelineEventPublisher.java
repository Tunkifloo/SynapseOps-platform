package com.synapseops.orchestrator.infra.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.dto.kafka.PipelineJobRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Slf4j
@Component
@RequiredArgsConstructor
public class PipelineEventPublisher {

    private static final String TOPIC_REQUESTS = "mlops.pipeline.requests";

    /**
     * Espera acotada del ACK del broker. Si se supera, se considera fallo de
     * publicación y el llamador compensa (marca la ejecución como FAILED) en
     * lugar de dejarla colgada en RUNNING. Se invoca desde un hilo boundedElastic,
     * por lo que el bloqueo no afecta al event-loop de WebFlux.
     */
    private static final long ACK_TIMEOUT_SECONDS = 10L;

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper                  objectMapper;

    /**
     * Publica el job de entrenamiento de forma síncrona respecto al ACK.
     *
     * @throws IllegalStateException si falla la serialización o no se confirma la
     *                               publicación dentro del timeout (permite compensación).
     */
    public void publishPipelineJob(PipelineJobRequest request) {
        final String payload;
        try {
            payload = objectMapper.writeValueAsString(request);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Error serializando PipelineJobRequest: "
                    + e.getMessage(), e);
        }

        try {
            SendResult<String, String> result = kafkaTemplate
                    .send(TOPIC_REQUESTS, request.executionId(), payload)
                    .get(ACK_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            log.info("Job publicado en Kafka. ExecutionId: {} | Partition: {} | Offset: {}",
                    request.executionId(),
                    result.getRecordMetadata().partition(),
                    result.getRecordMetadata().offset());

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "Publicación interrumpida para job " + request.executionId(), e);
        } catch (ExecutionException | TimeoutException e) {
            log.error("Fallo publicando job [{}] en Kafka: {}",
                    request.executionId(), e.getMessage());
            throw new IllegalStateException(
                    "No se pudo confirmar la publicación del job " + request.executionId()
                            + " en Kafka.", e);
        }
    }
}