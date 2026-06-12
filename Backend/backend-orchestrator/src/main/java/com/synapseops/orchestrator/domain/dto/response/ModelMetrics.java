package com.synapseops.orchestrator.domain.dto.response;

/**
 * Telemetría agregada por MODELO (nombre del registro MLflow): indicadores de ciclo de
 * vida (TEL-01/02) + calidad ML. Una "fila" agrupa todas las ejecuciones/versiones del modelo.
 *
 * @param versions   Nº de ejecuciones (≈ versiones entrenadas) del modelo.
 * @param bestAccuracy Mejor accuracy entre las versiones (val_accuracy/final_accuracy).
 */
public record ModelMetrics(
        String modelName,
        String ownerUsername,
        String workspaceName,
        int versions,
        long completed,
        long failed,
        Double completionRate,
        Double deploySuccessRate,
        Double avgRetrainSeconds,
        Double avgLeadTimeDeploySeconds,
        Double avgColdStartMs,
        Double bestAccuracy,
        Double avgInteractionEffort,
        Long lastExecutionId
) {}
