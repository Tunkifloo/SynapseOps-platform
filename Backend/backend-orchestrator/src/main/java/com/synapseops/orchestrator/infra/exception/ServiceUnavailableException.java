package com.synapseops.orchestrator.infra.exception;

/**
 * Indica un fallo transitorio de una dependencia de infraestructura (p. ej. el
 * broker Kafka no confirmó la publicación). Se mapea a HTTP 503 para señalar al
 * cliente que la operación puede reintentarse, a diferencia de un error de
 * validación (400) o un fallo interno definitivo (500).
 */
public class ServiceUnavailableException extends RuntimeException {
    public ServiceUnavailableException(String message) {
        super(message);
    }

    public ServiceUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
