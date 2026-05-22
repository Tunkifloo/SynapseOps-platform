package com.synapseops.orchestrator.service.builder;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@Component
public class DockerfileBuilder {

    private String artifactPath      = "";
    private String modelName         = "model";
    private String mlflowTrackingUri = "http://mlflow-server:5000";

    public DockerfileBuilder setArtifactPath(String artifactPath) {
        this.artifactPath = artifactPath;
        return this;
    }

    public DockerfileBuilder setModelName(String modelName) {
        this.modelName = modelName;
        return this;
    }

    public DockerfileBuilder setMlflowTrackingUri(String uri) {
        this.mlflowTrackingUri = uri;
        return this;
    }

    public String build() {
        String template = loadTemplate("templates/tensorflow.Dockerfile.mustache");
        return template
                .replace("{{artifactPath}}",      artifactPath)
                .replace("{{modelName}}",          modelName)
                .replace("{{mlflowTrackingUri}}", mlflowTrackingUri);
    }

    private String loadTemplate(String path) {
        try (InputStream is = new ClassPathResource(path).getInputStream()) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Plantilla Dockerfile no encontrada: " + path, e);
        }
    }

    public DockerfileBuilder reset() {
        this.artifactPath      = "";
        this.modelName         = "model";
        this.mlflowTrackingUri = "http://mlflow-server:5000";
        return this;
    }
}