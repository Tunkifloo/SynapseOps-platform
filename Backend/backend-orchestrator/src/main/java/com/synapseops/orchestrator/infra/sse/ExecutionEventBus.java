package com.synapseops.orchestrator.infra.sse;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

/**
 * Bus de eventos de ejecución en memoria (HU-023). Los productores (servicio de
 * ejecución, consumidor Kafka de resultados) publican eventos; los suscriptores
 * SSE escuchan filtrando por `executionId`. Multicast: tail en vivo (los
 * suscriptores tardíos no reciben eventos previos, lo cual es aceptable para logs).
 */
@Slf4j
@Component
public class ExecutionEventBus {

    private final Sinks.Many<ExecutionLogEvent> sink =
            Sinks.many().multicast().onBackpressureBuffer();

    public void publish(String executionId, String level, String message) {
        publish(executionId, level, message, false);
    }

    public void publish(String executionId, String level, String message, boolean terminal) {
        Sinks.EmitResult result = sink.tryEmitNext(
                ExecutionLogEvent.of(executionId, level, message, terminal));
        if (result.isFailure()) {
            log.debug("No se pudo emitir evento SSE [{}]: {}", executionId, result);
        }
    }

    public Flux<ExecutionLogEvent> stream(String executionId) {
        return sink.asFlux().filter(event -> executionId.equals(event.executionId()));
    }
}
