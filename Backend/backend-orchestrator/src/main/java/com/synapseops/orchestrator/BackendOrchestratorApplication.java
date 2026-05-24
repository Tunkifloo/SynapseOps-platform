package com.synapseops.orchestrator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.kafka.annotation.EnableKafka;

@SpringBootApplication
@EnableKafka
@ConfigurationPropertiesScan
public class BackendOrchestratorApplication {

    public static void main(String[] args) {
        SpringApplication.run(BackendOrchestratorApplication.class, args);
    }

}
