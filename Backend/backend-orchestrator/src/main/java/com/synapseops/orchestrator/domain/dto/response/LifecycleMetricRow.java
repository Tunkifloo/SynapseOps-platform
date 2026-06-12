package com.synapseops.orchestrator.domain.dto.response;

/**
 * TEL-02 · Fila de indicadores de ciclo de vida por ejecución (Process/Lifecycle, OE4).
 *
 * @param tRetrainSeconds       Tiempo de Re-entrenamiento T_re = t_fin_entrenamiento − t_inicio_ingesta (s).
 * @param leadTimeDeploySeconds Lead Time de Despliegue LT_d = t_despliegue_disponible − t_aprobacion_modelo (s).
 * @param coldStartMs           Cold start del model-service (TA-001), ms hasta el primer /health 200.
 * @param interactionEffort     Esfuerzo de Interacción: nº de nodos del lienzo low-code (pasos manuales).
 */
public record LifecycleMetricRow(
        Long executionId,
        String ownerUsername,
        String workspaceName,
        String pipelineName,
        String modelName,
        String status,
        Double tRetrainSeconds,
        Double leadTimeDeploySeconds,
        Long coldStartMs,
        String deployStatus,
        Integer interactionEffort,
        /** Señal de calidad: OK | OVERFIT | DRIFT | OVERFIT+DRIFT | null (sin datos). */
        String dataQuality
) {}
