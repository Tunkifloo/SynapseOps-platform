package com.synapseops.orchestrator.infra.kafka;

import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaResultListener {

    private final PipelineResultProcessor resultProcessor;

    @KafkaListener(
            topics            = "mlops.pipeline.results",
            groupId           = "orchestrator-results-group",
            containerFactory  = "resultsListenerContainerFactory"
    )
    public void onPipelineResult(String message) {
        log.info(">>> Resultado Kafka recibido (longitud={})", message.length());
        resultProcessor.process(message);
    }
}