package com.synapseops.orchestrator.mapper;

import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import com.synapseops.orchestrator.domain.dto.response.WorkspaceResponse;
import com.synapseops.orchestrator.domain.entity.Workspace;
import org.springframework.stereotype.Component;

@Component
public class WorkspaceMapper {

    public WorkspaceResponse toResponse(Workspace workspace) {
        return new WorkspaceResponse(
                workspace.getIdWorkspace(),
                workspace.getName(),
                workspace.getDescription(),
                workspace.getCreatedAt(),
                workspace.getUser().getIdUser(),
                workspace.getUser().getUsername(),
                workspace.getDatasetPath()
        );
    }

    public void updateFromRequest(Workspace workspace, WorkspaceRequest request) {
        if (request.name() != null)        workspace.setName(request.name());
        if (request.description() != null) workspace.setDescription(request.description());
    }
}
