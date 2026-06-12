package com.synapseops.orchestrator.domain.dto.response;

import java.util.List;

/**
 * TEL-02 · Matriz de indicadores de "Process (Lifecycle)" (OE4) sobre la muestra del usuario.
 *
 * @param sampleSize               n de ejecuciones (apunta a la muestra estadística de 30-31 proyectos).
 * @param completionRate           Tasa de Completitud (%): COMPLETED / (COMPLETED + FAILED) · 100.
 * @param deploySuccessRate        Tasa de Despliegues Exitosos (%): SUCCESS / total desplegados · 100.
 * @param avgRetrainSeconds        T_re promedio (s).
 * @param avgLeadTimeDeploySeconds LT_d promedio (s).
 * @param avgColdStartMs           Cold start promedio (ms).
 * @param avgInteractionEffort     Esfuerzo de Interacción promedio (nodos del lienzo).
 */
public record LifecycleMetricsResponse(
        int sampleSize,
        Double completionRate,
        Double deploySuccessRate,
        Double avgRetrainSeconds,
        Double avgLeadTimeDeploySeconds,
        Double avgColdStartMs,
        Double avgInteractionEffort,
        List<LifecycleMetricRow> rows
) {}
