package com.synapseops.orchestrator.domain.dto.response;

import java.util.List;

/** Vista de telemetría agrupada por modelo (Monitoreo "Por modelo" / Analítica global). */
public record ByModelView(
        int modelCount,
        List<ModelMetrics> models
) {}
