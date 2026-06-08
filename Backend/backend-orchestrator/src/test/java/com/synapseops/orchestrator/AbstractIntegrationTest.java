package com.synapseops.orchestrator;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import reactor.netty.http.client.HttpClient;

/**
 * Clase base para todos los tests de integración.
 *
 * Patrón Singleton de Testcontainers (ADR-011):
 * El contenedor PostgreSQL arranca UNA sola vez para toda la suite
 * y se reutiliza en cada test, evitando el overhead de recreación
 * y el thermal throttling en hardware de laboratorio UPAO.
 *
 * Cada clase que extienda esta base:
 *  - Obtiene un WebTestClient apuntando al puerto aleatorio del servidor
 *  - Comparte el mismo contenedor PostgreSQL 17
 *  - Corre con el perfil "test" (Kafka sin broker real)
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Tag("integration")
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:17-alpine"))
                    .withDatabaseName("orchestrator")
                    .withUsername("postgres")
                    .withPassword("test_password")
                    .withReuse(true);


    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void overrideDataSourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",      POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.url",          POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user",         POSTGRES::getUsername);
        registry.add("spring.flyway.password",     POSTGRES::getPassword);
    }

    @LocalServerPort
    protected int port;

    protected WebTestClient webTestClient;

    @BeforeEach
    void initWebClient() {
        // Conexión nueva por request (sin pool keep-alive): evita PrematureCloseException
        // intermitente al reutilizar conexiones que el servidor Netty ya cerró.
        HttpClient httpClient = HttpClient.newConnection();
        webTestClient = WebTestClient
                .bindToServer(new ReactorClientHttpConnector(httpClient))
                .baseUrl("http://localhost:" + port)
                .responseTimeout(java.time.Duration.ofSeconds(30))
                .build();
    }
}
