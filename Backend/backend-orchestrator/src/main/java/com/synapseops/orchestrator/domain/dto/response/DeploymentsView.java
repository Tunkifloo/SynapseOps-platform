package com.synapseops.orchestrator.domain.dto.response;

import java.util.List;

/**
 * Vista del módulo "Despliegues" (HU-029): despliegues del usuario + cupo.
 *
 * @param max         tope de despliegues concurrentes (TA-004 · max-deployments).
 * @param active      model-services activos ahora en el host.
 * @param deployments despliegues del usuario.
 */
public record DeploymentsView(
        int max,
        int active,
        List<DeploymentItem> deployments
) {}
