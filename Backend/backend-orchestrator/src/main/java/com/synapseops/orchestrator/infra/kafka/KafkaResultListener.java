package com.synapseops.orchestrator.infra.kafka;

import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.repository.*;
import jakarta.annotation.PostConstruct;
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
            topics           = "mlops.pipeline.results",
            groupId          = "orchestrator-results-group"
    )
    public void onPipelineResult(String message) {
        log.info(">>> [KafkaResultListener] Mensaje recibido, longitud={}", message.length());
        resultProcessor.process(message);
    }
    @PostConstruct
    public void init() {
        log.info("KafkaResultListener registrado — escuchando mlops.pipeline.results");
    }
}