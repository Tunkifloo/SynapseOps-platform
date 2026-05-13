package com.synapseops.orchestrator.config;

import com.synapseops.orchestrator.infra.filter.MdcContextLifter;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MdcConfig {

    @PostConstruct
    public void registerMdcHook() {
        MdcContextLifter.register();
    }

    @PreDestroy
    public void resetMdcHook() {
        MdcContextLifter.reset();
    }
}