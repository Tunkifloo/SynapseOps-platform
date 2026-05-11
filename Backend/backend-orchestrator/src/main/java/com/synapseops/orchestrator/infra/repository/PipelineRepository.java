package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.Pipeline;
import com.synapseops.orchestrator.domain.entity.PipelineStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PipelineRepository extends JpaRepository<Pipeline, Long> {
    List<Pipeline> findByWorkspace_IdWorkspace(Long workspaceId);
    List<Pipeline> findByWorkspace_IdWorkspaceAndStatus(Long workspaceId, PipelineStatus status);
}
