package com.synapseops.orchestrator.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.codec.ServerCodecConfigurer;
import org.springframework.web.reactive.config.WebFluxConfigurer;

/**
 * Límite de buffer en memoria para los codecs del servidor (lectura de @RequestBody).
 *
 * El endpoint POST /api/v1/deployments/{id}/predict recibe la imagen en BASE64 dentro del
 * JSON. Una imagen real (p. ej. microscopía) en base64 supera con creces el límite por
 * defecto de WebFlux (256 KB) → "DataBufferLimitException: Exceeded limit ... 262144" →
 * 413 CONTENT_TOO_LARGE. La propiedad `spring.codec.max-in-memory-size` del YAML no se
 * estaba aplicando a la decodificación del @RequestBody, así que se fija aquí de forma
 * explícita (este hook customiza directamente los codecs que usan los controladores).
 */
@Configuration
public class WebFluxCodecConfig implements WebFluxConfigurer {

    /** 20 MB: holgado para una imagen de inferencia en base64 (se infiere de una en una). */
    private static final int MAX_IN_MEMORY_BYTES = 20 * 1024 * 1024;

    @Override
    public void configureHttpMessageCodecs(ServerCodecConfigurer configurer) {
        configurer.defaultCodecs().maxInMemorySize(MAX_IN_MEMORY_BYTES);
    }
}
