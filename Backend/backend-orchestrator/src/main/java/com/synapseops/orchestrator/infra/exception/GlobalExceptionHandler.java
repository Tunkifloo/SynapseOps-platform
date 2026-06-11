package com.synapseops.orchestrator.infra.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.server.ServerWebExchange;

import java.net.URI;
import java.time.Instant;
import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(WebExchangeBindException.class)
    public ProblemDetail handleValidationException(WebExchangeBindException ex,
                                                   ServerWebExchange exchange) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .collect(Collectors.joining(", "));

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setType(URI.create("/errors/validation"));
        problem.setTitle("Error de validación");
        problem.setDetail(detail);
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgument(IllegalArgumentException ex,
                                                ServerWebExchange exchange) {
        if (ex.getMessage() != null && ex.getMessage().contains("supera el tamaño máximo")) {
            ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.PAYLOAD_TOO_LARGE);
            problem.setType(URI.create("/errors/payload-too-large"));
            problem.setTitle("Archivo demasiado grande");
            problem.setDetail(ex.getMessage());
            problem.setProperty("timestamp", Instant.now());
            problem.setProperty("path", exchange.getRequest().getPath().value());
            return problem;
        }
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setType(URI.create("/errors/business-rule"));
        problem.setTitle("Solicitud inválida");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail handleIllegalState(IllegalStateException ex,
                                            ServerWebExchange exchange) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setType(URI.create("/errors/business-rule"));
        problem.setTitle("Solicitud inválida");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ProblemDetail handleBadCredentials(BadCredentialsException ex,
                                              ServerWebExchange exchange) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.UNAUTHORIZED);
        problem.setType(URI.create("/errors/authentication"));
        problem.setTitle("Credenciales inválidas");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(DisabledException.class)
    public ProblemDetail handleDisabledAccount(DisabledException ex,
                                               ServerWebExchange exchange) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.UNAUTHORIZED);
        problem.setType(URI.create("/errors/account-disabled"));
        problem.setTitle("Cuenta deshabilitada");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleAccessDenied(AccessDeniedException ex,
                                            ServerWebExchange exchange) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.FORBIDDEN);
        problem.setType(URI.create("/errors/access-denied"));
        problem.setTitle("Acceso denegado");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(AccountLockedException.class)
    public ProblemDetail handleAccountLocked(AccountLockedException ex,
                                             ServerWebExchange exchange) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.LOCKED);
        problem.setType(URI.create("/errors/account-locked"));
        problem.setTitle("Cuenta bloqueada");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        problem.setProperty("redirectTo", "forgot-password");
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGenericException(Exception ex,
                                                ServerWebExchange exchange) {
        // Auditoría (item 2): los 500 inesperados deben quedar en el log con causa y
        // ruta. Antes se devolvía el ProblemDetail sin registrar nada → 500 silencioso.
        log.error("Error inesperado en {} {}: {}",
                exchange.getRequest().getMethod(),
                exchange.getRequest().getPath().value(),
                ex.toString(), ex);
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        problem.setType(URI.create("/errors/internal"));
        problem.setTitle("Error interno del servidor");
        problem.setDetail("Ocurrió un error inesperado. Contacte al administrador.");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrity(DataIntegrityViolationException ex,
                                             ServerWebExchange exchange) {
        // Violación de restricción única/integridad (p. ej. carrera en username,
        // email o nombre de workspace duplicado). Se traduce a 409 Conflict.
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        problem.setType(URI.create("/errors/conflict"));
        problem.setTitle("Conflicto de datos");
        problem.setDetail("El recurso ya existe o viola una restricción de unicidad.");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }

    @ExceptionHandler(ServiceUnavailableException.class)
    public ProblemDetail handleServiceUnavailable(ServiceUnavailableException ex,
                                                  ServerWebExchange exchange) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.SERVICE_UNAVAILABLE);
        problem.setType(URI.create("/errors/service-unavailable"));
        problem.setTitle("Servicio no disponible temporalmente");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        problem.setProperty("retryable", true);
        return problem;
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException ex,
                                        ServerWebExchange exchange) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        problem.setType(URI.create("/errors/not-found"));
        problem.setTitle("Recurso no encontrado");
        problem.setDetail(ex.getMessage());
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("path", exchange.getRequest().getPath().value());
        return problem;
    }
}
