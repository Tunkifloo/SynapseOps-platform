package com.synapseops.orchestrator.service.builder;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Resuelve el contexto de build del model-service a partir de la plantilla
 * versionada TA-007 (módulo {@code Backend/model-service/}).
 *
 * <p>La plantilla del Sprint 3 es estática: el {@code Dockerfile} no lleva
 * placeholders (a diferencia del antiguo {@code .mustache}). La parametrización
 * ocurre en build-time vía {@code --build-arg FRAMEWORK=tf|torch} y en runtime
 * vía variables de entorno ({@code MODEL_PATH}, {@code INPUT_SIZE}, ...). Por eso
 * este builder ya no inyecta variables en el texto: solo (1) detecta el framework
 * según la extensión del artefacto y (2) devuelve el Dockerfile de la plantilla.
 */
@Component
public class DockerfileBuilder {

    /** Directorio de la plantilla del model-service (montado como volumen en prod). */
    @Value("${synapseops.model-service.template-dir:/app/model-service-template}")
    private String templateDir;

    private String artifactPath = "";

    public DockerfileBuilder setArtifactPath(String artifactPath) {
        this.artifactPath = artifactPath != null ? artifactPath : "";
        return this;
    }

    /**
     * Framework de inferencia según la extensión del artefacto:
     * {@code .pt}/{@code .pth} → {@code torch}; {@code .keras}/{@code .h5} → {@code tf}.
     * Coincide con el {@code --build-arg FRAMEWORK} y los {@code requirements-<fw>.txt}
     * de la plantilla TA-007.
     */
    public String resolveFramework() {
        String lower = artifactPath.toLowerCase();
        if (lower.endsWith(".pt") || lower.endsWith(".pth")) {
            return "torch";
        }
        return "tf";
    }

    /** Devuelve el Dockerfile estático de la plantilla TA-007 (sin sustituciones). */
    public String build() {
        return loadTemplate("Dockerfile");
    }

    private String loadTemplate(String fileName) {
        Path file = Path.of(templateDir, fileName);
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Plantilla del model-service no encontrada: " + file
                            + " (revisa synapseops.model-service.template-dir)", e);
        }
    }

    public DockerfileBuilder reset() {
        this.artifactPath = "";
        return this;
    }
}
