package com.synapseops.orchestrator.infra.filter;

import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import reactor.util.context.Context;

import java.util.UUID;

@Component
@Order(-100)
public class TraceIdWebFilter implements WebFilter {

    public static final String TRACE_ID_KEY   = "traceId";
    public static final String REQUEST_ID_KEY = "X-Request-ID";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String traceId = exchange.getRequest()
                .getHeaders()
                .getFirst(REQUEST_ID_KEY);

        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString()
                    .replace("-", "").substring(0, 16);
        }

        final String finalTraceId = traceId;

        exchange.getResponse().beforeCommit(() -> {
            exchange.getResponse().getHeaders()
                    .add(REQUEST_ID_KEY, finalTraceId);
            return Mono.empty();
        });

        return chain.filter(exchange)
                .contextWrite(Context.of(TRACE_ID_KEY, finalTraceId))
                .doOnEach(signal -> {
                    String tid = signal.getContextView()
                            .getOrDefault(TRACE_ID_KEY, "NO_TRACE");
                    MDC.put(TRACE_ID_KEY, tid);
                })
                .doFinally(signalType -> MDC.remove(TRACE_ID_KEY));
    }
}