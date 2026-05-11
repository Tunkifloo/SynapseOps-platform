package com.synapseops.orchestrator.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaConfig {

    @Bean
    public NewTopic pipelineRequestsTopic() {
        return TopicBuilder.name("mlops.pipeline.requests")
                .partitions(1)
                .replicas(1)
                .build();
    }

    @Bean
    public NewTopic pipelineResultsTopic() {
        return TopicBuilder.name("mlops.pipeline.results")
                .partitions(1)
                .replicas(1)
                .build();
    }
}
