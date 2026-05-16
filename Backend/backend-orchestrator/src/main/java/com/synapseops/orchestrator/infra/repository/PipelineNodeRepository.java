package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.PipelineNode;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PipelineNodeRepository extends JpaRepository<PipelineNode, Long> {
    List<PipelineNode> findByPipeline_IdPipelineOrderByOrderIndexAsc(Long pipelineId);
}
