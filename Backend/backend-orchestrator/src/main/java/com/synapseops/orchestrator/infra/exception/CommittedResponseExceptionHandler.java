package com.synapseops.orchestrator.infra.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebExceptionHandler;
import reactor.core.publisher.Mono;

/**
 * Red de seguridad para errores que se propagan <b>después</b> de que la
 * respuesta ya fue confirmada (committed).
 *
 * <p>En WebFlux, si una operación de escritura/borrado emite su resultado
 * (p. ej. 204) y luego surge una señal tardía, el intento del framework de
 * renderizar un cuerpo de error invoca {@code setContentType} sobre cabeceras
 * de solo-lectura → {@link UnsupportedOperationException} y un 500 espurio,
 * aunque la operación de negocio ya persistió correctamente.
 *
 * <p>Este handler se ejecuta antes que el manejador por defecto (orden -2): si
 * la respuesta ya está comprometida, no hay nada que escribir, así que registra
 * el incidente y completa en silencio. Si no está comprometida, delega
 * propagando la excepción al siguiente handler.
 */
@Slf4j
@Component
public class CommittedResponseExceptionHandler implements WebExceptionHandler, org.springframework.core.Ordered {

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        if (exchange.getResponse().isCommitted()) {
            log.warn("Error tras respuesta comprometida ({}), se ignora el reintento de escritura: {} — {}",
                    exchange.getResponse().getStatusCode(),
                    exchange.getRequest().getMethod() + " " + exchange.getRequest().getPath().value(),
                    ex.toString());
            return Mono.empty();
        }
        // Respuesta aún editable → que la maneje el siguiente handler (GlobalExceptionHandler / default).
        return Mono.error(ex);
    }

    @Override
    public int getOrder() {
        // Antes que el manejador por defecto de Spring Boot (orden -1).
        return -2;
    }
}
