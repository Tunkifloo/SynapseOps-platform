package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.ExecutionStatus;
import com.synapseops.orchestrator.domain.entity.PipelineExecution;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PipelineExecutionRepository extends JpaRepository<PipelineExecution, Long> {
    List<PipelineExecution> findByPipeline_IdPipelineOrderByStartedAtDesc(Long pipelineId);
    Optional<PipelineExecution> findByMlflowRunId(String mlflowRunId);
    List<PipelineExecution> findByStatus(ExecutionStatus status);
}
