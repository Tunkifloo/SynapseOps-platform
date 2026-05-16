package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.MLArtifact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MLArtifactRepository extends JpaRepository<MLArtifact, Long> {
    Optional<MLArtifact> findByRunId(String runId);
    Optional<MLArtifact> findByExecution_IdExecution(Long executionId);
}
