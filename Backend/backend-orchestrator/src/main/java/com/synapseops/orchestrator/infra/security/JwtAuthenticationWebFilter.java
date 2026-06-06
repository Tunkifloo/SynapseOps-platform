package com.synapseops.orchestrator.infra.security;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.userdetails.ReactiveUserDetailsService;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationWebFilter implements WebFilter {

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

        return userDetailsService.findByUsername(username)
                .filter(userDetails -> jwtService.isTokenValid(jwt, userDetails))
                .flatMap(userDetails -> {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(
                                    userDetails,
                                    null,
                                    userDetails.getAuthorities()
                            );
                    return chain.filter(exchange)
                            .contextWrite(ReactiveSecurityContextHolder
                                    .withAuthentication(authToken));
                })
                .switchIfEmpty(chain.filter(exchange));
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
