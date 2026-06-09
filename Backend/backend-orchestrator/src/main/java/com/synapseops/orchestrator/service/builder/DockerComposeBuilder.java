package com.synapseops.orchestrator.service.builder;

import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.util.*;

@Component
public class DockerComposeBuilder {

    private String              serviceName   = "model-service";
    private String              image         = "synapseops/model-service:latest";
    private int                 hostPort      = 8000;
    private int                 containerPort = 8000;
    private String              network       = "mlops-network";
    private Map<String, String> envVars       = new LinkedHashMap<>();
    private List<String>        volumes       = new ArrayList<>();

    public DockerComposeBuilder setServiceName(String name) {
        this.serviceName = name; return this;
    }

    public DockerComposeBuilder setImage(String image) {
        this.image = image; return this;
    }

    public DockerComposeBuilder addPort(int host, int container) {
        this.hostPort = host; this.containerPort = container; return this;
    }

    public DockerComposeBuilder addEnvVar(String key, String value) {
        this.envVars.put(key, value); return this;
    }

    public DockerComposeBuilder addVolume(String volume) {
        this.volumes.add(volume); return this;
    }

    public String build() {
        Map<String, Object> service = new LinkedHashMap<>();
        service.put("image",          image);
        service.put("container_name", serviceName);
        service.put("ports",          List.of(hostPort + ":" + containerPort));
        service.put("environment",    new LinkedHashMap<>(envVars));
        if (!volumes.isEmpty()) {
            service.put("volumes", new ArrayList<>(volumes));
        }
        service.put("networks", List.of(network));

        Map<String, Object> healthcheck = new LinkedHashMap<>();
        healthcheck.put("test",     List.of("CMD", "curl", "-f",
                "http://localhost:" + containerPort + "/health"));
        healthcheck.put("interval", "10s");
        healthcheck.put("timeout",  "5s");
        healthcheck.put("retries",  3);
        service.put("healthcheck",  healthcheck);

        Map<String, Object> services = new LinkedHashMap<>();
        services.put(serviceName, service);

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("services", services);
        root.put("networks", Map.of(network, Map.of("external", true)));

        DumperOptions opts = new DumperOptions();
        opts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        opts.setPrettyFlow(true);
        opts.setIndent(2);
        return new Yaml(opts).dump(root);
    }

    public DockerComposeBuilder reset() {
        this.envVars  = new LinkedHashMap<>();
        this.volumes  = new ArrayList<>();
        return this;
    }
}
