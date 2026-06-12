package com.synapseops.orchestrator.domain.dto.request;

/** Solicitud de despliegue desde el módulo/nodo de Despliegue: se identifica por runId. */
public record DeployRequest(String runId) {}
