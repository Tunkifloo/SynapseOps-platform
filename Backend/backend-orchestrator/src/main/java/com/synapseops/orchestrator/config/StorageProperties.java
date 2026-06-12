package com.synapseops.orchestrator.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "storage")
public class StorageProperties {
    private String basePath = "/storage";
    private long maxFileSizeMb = 500;
    /** Cuota de disco por workspace (datasets + extracted + models + downloads). */
    private long maxWorkspaceMb = 2000;
    /** Extensiones aceptadas (sin punto). Fuente única para validación y /storage/limits. */
    private List<String> allowedExtensions = List.of("png", "jpg", "jpeg", "zip");
    private List<String> allowedTypes = List.of("text/csv", "image/png", "image/jpeg");
}