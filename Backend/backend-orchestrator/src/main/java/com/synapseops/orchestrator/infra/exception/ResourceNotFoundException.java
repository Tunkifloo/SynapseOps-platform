package com.synapseops.orchestrator.infra.exception;

public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String resource, Long id) {
        super(String.format("%s no encontrado con ID: %d", resource, id));
    }
    public ResourceNotFoundException(String message) {
        super(message);
    }
}