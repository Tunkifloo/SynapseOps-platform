package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.Pipeline;
import com.synapseops.orchestrator.domain.entity.PipelineStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PipelineRepository extends JpaRepository<Pipeline, Long> {

    @EntityGraph(attributePaths = {"workspace", "workspace.user"})
    Optional<Pipeline> findById(Long id);

    @EntityGraph(attributePaths = {"workspace", "workspace.user"})
    List<Pipeline> findByWorkspace_IdWorkspace(Long workspaceId);

    List<Pipeline> findByWorkspace_IdWorkspaceAndStatus(Long workspaceId, PipelineStatus status);
}
