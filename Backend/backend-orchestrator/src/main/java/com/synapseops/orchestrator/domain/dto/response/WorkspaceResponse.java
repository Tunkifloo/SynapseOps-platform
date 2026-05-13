package com.synapseops.orchestrator.domain.dto.response;

import java.time.LocalDateTime;

public record WorkspaceResponse(
        Long idWorkspace,
        String name,
        String description,
        LocalDateTime createdAt,
        Long idUser,
        String ownerUsername,
        String datasetPath
) {}