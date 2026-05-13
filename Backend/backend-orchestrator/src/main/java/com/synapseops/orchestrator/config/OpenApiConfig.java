package com.synapseops.orchestrator.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearerAuth";

    @Bean
    public OpenAPI synapseOpsOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("SynapseOps — Backend Orchestrator API")
                        .description("""
                                API REST del orquestador de pipelines MLOps.
                                Gestiona autenticación, workspaces, pipelines,
                                datasets, modelos y telemetría de contenedores.
                                """)
                        .version("1.0.0")
                        .contact(new Contact()
                                .name("Equipo SynapseOps")
                                .email("nicolocisneros@gmail.com")))
                .addSecurityItem(new SecurityRequirement()
                        .addList(BEARER_SCHEME))
                .components(new Components()
                        .addSecuritySchemes(BEARER_SCHEME,
                                new SecurityScheme()
                                        .name(BEARER_SCHEME)
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("Token JWT — obtener en POST /api/v1/auth/login")));
    }
}
