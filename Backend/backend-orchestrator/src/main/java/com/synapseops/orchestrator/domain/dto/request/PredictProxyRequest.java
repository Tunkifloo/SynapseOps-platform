package com.synapseops.orchestrator.domain.dto.request;

/** Imagen en base64 para probar el /predict del model-service desde la UI. */
public record PredictProxyRequest(String image) {}
