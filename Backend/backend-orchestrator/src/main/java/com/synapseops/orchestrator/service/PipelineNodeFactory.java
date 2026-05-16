package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.entity.*;
import org.springframework.stereotype.Component;

@Component
public class PipelineNodeFactory {

    public PipelineNode createNode(NodeType nodeType) {
        PipelineNode node = new PipelineNode();
        node.setNodeType(nodeType);
        node.setStatus(NodeStatus.PENDING);
        node.setOrderIndex(nodeType.ordinal());
        node.setConfigJson("{}");
        return node;
    }
}
