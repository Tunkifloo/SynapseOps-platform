package com.synapseops.orchestrator.infra.sse;

import java.time.Instant;

/**
 * Evento de log/estado de una ejecución, transmitido en tiempo real vía SSE (HU-023, ADR-002).
 *
 * @param executionId id de la ejecución
 * @param level       INFO | WARN | ERROR
 * @param message     mensaje legible
 * @param timestamp   ISO-8601
 * @param terminal    true si es el último evento (COMPLETED/FAILED) → el cliente cierra el stream
 */
public record ExecutionLogEvent(
        String executionId,
        String level,
        String message,
        String timestamp,
        boolean terminal
) {
    public static ExecutionLogEvent of(String executionId, String level, String message, boolean terminal) {
        return new ExecutionLogEvent(executionId, level, message, Instant.now().toString(), terminal);
    }
}
