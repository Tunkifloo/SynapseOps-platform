package com.synapseops.orchestrator.domain.dto.response;

/** Un model-service desplegado, para el módulo "Despliegues" (HU-029). */
public record DeploymentItem(
        Long    executionId,
        Long    workspaceId,
        String  workspaceName,
        String  modelVersion,
        String  runId,          // para redesplegar (POST /deployments {runId})
        String  containerName,
        Integer port,
        String  endpoint,
        String  deployStatus,   // SUCCESS | FAILED (resultado del despliegue)
        Long    coldStartMs,
        boolean running         // estado en vivo según Docker
) {}
