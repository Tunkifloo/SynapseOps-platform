package com.synapseops.orchestrator.config;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.zerodep.ZerodepDockerHttpClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class DockerClientConfig {

    @Bean
    public DockerClient dockerClient() {
        DefaultDockerClientConfig config = DefaultDockerClientConfig
                .createDefaultConfigBuilder()
                .withDockerHost(System.getProperty("os.name")
                        .toLowerCase().contains("win")
                        ? "npipe:////./pipe/docker_engine"
                        : "unix:///var/run/docker.sock")
                .withDockerTlsVerify(false)
                .withApiVersion("1.47")
                .build();

        ZerodepDockerHttpClient httpClient = new ZerodepDockerHttpClient.Builder()
                .dockerHost(config.getDockerHost())
                .maxConnections(20)
                .connectionTimeout(Duration.ofSeconds(5))
                .responseTimeout(Duration.ofMinutes(15))
                .build();

        return DockerClientImpl.getInstance(config, httpClient);
    }
}
