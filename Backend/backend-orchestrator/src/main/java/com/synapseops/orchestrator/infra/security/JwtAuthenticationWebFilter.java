package com.synapseops.orchestrator.infra.security;

import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.userdetails.ReactiveUserDetailsService;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import reactor.util.context.Context;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationWebFilter implements WebFilter {

    /** Clave MDC del actor (usuario autenticado) para la traza de auditoría. */
    public static final String ACTOR_KEY = "actor";

    private final JwtService jwtService;
    private final ReactiveUserDetailsService userDetailsService;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String jwt = resolveToken(exchange);
        if (jwt == null) {
            return chain.filter(exchange);
        }

        String username = jwtService.getUsernameFromToken(jwt);

        if (username == null) {
            return chain.filter(exchange);
        }

        // IMPORTANTE: no se puede usar `flatMap(-> chain.filter()).switchIfEmpty(chain.filter())`
        // porque chain.filter() devuelve Mono<Void> (completa vacío), lo que dispararía
        // switchIfEmpty SIEMPRE y ejecutaría la cadena DOS veces (doble escritura de la
        // respuesta → UnsupportedOperationException sobre headers ya committed).
        // Para distinguir "autenticado" de "sin auth", la rama autenticada emite TRUE
        // tras completar la cadena; la cadena se ejecuta EXACTAMENTE UNA VEZ por rama.
        return userDetailsService.findByUsername(username)
                .filter(userDetails -> jwtService.isTokenValid(jwt, userDetails))
                .flatMap(userDetails -> {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(
                                    userDetails,
                                    null,
                                    userDetails.getAuthorities()
                            );
                    // Actor (usuario) en el MDC para auditoría de operaciones (item 2).
                    return chain.filter(exchange)
                            .contextWrite(ReactiveSecurityContextHolder
                                    .withAuthentication(authToken))
                            .contextWrite(Context.of(ACTOR_KEY, username))
                            .doOnEach(signal -> {
                                if (signal.getContextView().hasKey(ACTOR_KEY)) {
                                    MDC.put(ACTOR_KEY, signal.getContextView().get(ACTOR_KEY));
                                }
                            })
                            .doFinally(signalType -> MDC.remove(ACTOR_KEY))
                            .then(Mono.just(Boolean.TRUE));
                })
                .switchIfEmpty(chain.filter(exchange).then(Mono.just(Boolean.FALSE)))
                .then();
    }

    /**
     * Obtiene el JWT del header Authorization o, como fallback, del query param
     * `token` (necesario para SSE/EventSource, que no permite cabeceras custom).
     */
    private String resolveToken(ServerWebExchange exchange) {
        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        String queryToken = exchange.getRequest().getQueryParams().getFirst("token");
        return (queryToken != null && !queryToken.isBlank()) ? queryToken : null;
    }
}
