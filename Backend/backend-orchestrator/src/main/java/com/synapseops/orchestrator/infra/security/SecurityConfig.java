package com.synapseops.orchestrator.infra.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableReactiveMethodSecurity;
import org.springframework.security.config.web.server.SecurityWebFiltersOrder;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableReactiveMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationWebFilter jwtAuthenticationWebFilter;

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(
            ServerHttpSecurity http) {
        return http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeExchange(auth -> auth
                        .pathMatchers("/api/v1/auth/**").permitAll()
                        .pathMatchers(
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/webjars/**",
                                "/api-docs",
                                "/api-docs/**",
                                "/api-docs/swagger-config",
                                "/actuator/**"
                        ).permitAll()
                        .anyExchange().authenticated()
                )
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((exchange, e) -> {
                            var response = exchange.getResponse();
                            // Si la respuesta ya está comprometida (p. ej. el entry point se
                            // invoca al completar un Flux ya autenticado), no se pueden mutar
                            // los headers (son read-only) → completar sin escribir cuerpo.
                            if (response.isCommitted()) {
                                return response.setComplete();
                            }
                            response.setStatusCode(org.springframework.http.HttpStatus.UNAUTHORIZED);
                            response.getHeaders().setContentType(
                                    org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON);
                            String body = """
                                    {"type":"/errors/authentication","title":"No autenticado",\
                                    "status":401,"detail":"Se requiere un token de autenticación válido."}""";
                            var buffer = response.bufferFactory()
                                    .wrap(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                            return response.writeWith(reactor.core.publisher.Mono.just(buffer));
                        })
                )
                .addFilterBefore(jwtAuthenticationWebFilter,
                        SecurityWebFiltersOrder.AUTHENTICATION)
                .httpBasic(ServerHttpSecurity.HttpBasicSpec::disable)
                .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:3000",
                "http://localhost:5173",
                "https://*.ngrok-free.app",
                "https://*.ngrok.io"
        ));
        config.setAllowedMethods(Arrays.asList(
                "GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(Arrays.asList(
                "Authorization", "Cache-Control", "Content-Type"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}