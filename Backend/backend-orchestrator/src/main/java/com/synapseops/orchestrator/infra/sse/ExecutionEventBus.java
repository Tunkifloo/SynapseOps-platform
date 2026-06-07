package com.synapseops.orchestrator.infra.sse;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Bus de eventos de ejecución en memoria (HU-023).
 *
 * <p>Un sink <b>por ejecución</b> con {@code replay().all()}: los suscriptores
 * tardíos (o que reconectan al cambiar de vista) reciben TODO el historial de la
 * ejecución, no solo el tail. Esto soluciona:
 * <ul>
 *   <li>El streaming que dejaba de funcionar tras la primera desconexión (un único
 *       sink {@code multicast()} con autoCancel se terminaba para siempre).</li>
 *   <li>La persistencia del historial de logs al navegar entre componentes.</li>
 * </ul>
 *
 * <p>Acotado: se conservan los últimos {@code MAX_EXECUTIONS} sinks (LRU simple)
 * para no crecer sin límite en el entorno de 8&nbsp;GB.
 */
@Slf4j
@Component
public class ExecutionEventBus {

    private static final int MAX_EXECUTIONS = 100;

    private final Map<String, Sinks.Many<ExecutionLogEvent>> sinks = new ConcurrentHashMap<>();
    // Orden de inserción para evicción LRU aproximada.
    private final ConcurrentLinkedQueue<String> order = new ConcurrentLinkedQueue<>();

    private Sinks.Many<ExecutionLogEvent> sinkFor(String executionId) {
        return sinks.computeIfAbsent(executionId, id -> {
            order.add(id);
            evictIfNeeded();
            // replay().all() → historial completo a cada nuevo suscriptor (no autoCancel).
            return Sinks.many().replay().all();
        });
    }

    private void evictIfNeeded() {
        while (sinks.size() > MAX_EXECUTIONS) {
            String oldest = order.poll();
            if (oldest == null) {
                break;
            }
            Sinks.Many<ExecutionLogEvent> removed = sinks.remove(oldest);
            if (removed != null) {
                removed.tryEmitComplete();
            }
        }
    }

    public void publish(String executionId, String level, String message) {
        publish(executionId, level, message, false);
    }

    public void publish(String executionId, String level, String message, boolean terminal) {
        Sinks.EmitResult result = sinkFor(executionId).tryEmitNext(
                ExecutionLogEvent.of(executionId, level, message, terminal));
        if (result.isFailure()) {
            log.debug("No se pudo emitir evento SSE [{}]: {}", executionId, result);
        }
    }

    public Flux<ExecutionLogEvent> stream(String executionId) {
        return sinkFor(executionId).asFlux();
    }
}
