package com.synapseops.orchestrator.mapper;

import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import com.synapseops.orchestrator.domain.entity.Pipeline;
import org.springframework.stereotype.Component;

@Component
public class PipelineMapper {

    public PipelineResponse toResponse(Pipeline pipeline) {
        return new PipelineResponse(
                pipeline.getIdPipeline(),
                pipeline.getName(),
                pipeline.getStatus(),
                pipeline.getWorkspace().getIdWorkspace(),
                pipeline.getNodes().size(),
                pipeline.getExecutions().size()
        );
    }
}
