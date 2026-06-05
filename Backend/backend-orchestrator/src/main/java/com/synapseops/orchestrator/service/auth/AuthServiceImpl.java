package com.synapseops.orchestrator.service.auth;

import com.synapseops.orchestrator.domain.dto.request.ForgotPasswordRequest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.UserRegistrationRequest;
import com.synapseops.orchestrator.domain.dto.response.TokenResponse;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.Collaborator;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.infra.exception.AccountLockedException;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.security.JwtService;
import com.synapseops.orchestrator.mapper.UserMapper;
import com.synapseops.orchestrator.service.UserFactory;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.security.SignatureException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private static final int MAX_FAILED_ATTEMPTS = 3;
    // Ventana de bloqueo: tras MAX intentos, la cuenta queda bloqueada este tiempo
    // y luego se libera automáticamente (evita bloqueo permanente y fuga de memoria).
    private static final long LOCK_WINDOW_MS = 15 * 60 * 1000L;
    private final ConcurrentHashMap<String, LoginAttempts> failedAttempts = new ConcurrentHashMap<>();

    private static final class LoginAttempts {
        int count;
        long windowStartMs;
    }

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final UserFactory userFactory;
    private final UserMapper userMapper;
    private final TransactionTemplate transactionTemplate;

    @Override
    public Mono<TokenResponse> login(LoginRequest request) {
        return Mono.fromCallable(() ->
                        userRepository.findByUsername(request.username())
                )
                .subscribeOn(Schedulers.boundedElastic())
                .switchIfEmpty(Mono.error(new BadCredentialsException("Credenciales inválidas.")))
                .flatMap(optUser -> {
                    if (optUser.isEmpty()) {
                        // No se contabiliza: evita poblar el mapa con usuarios inexistentes
                        // (vector de fuga de memoria / DoS).
                        return Mono.error(new BadCredentialsException("Credenciales inválidas."));
                    }

                    User user = optUser.get();

                    if (isAccountLocked(request.username())) {
                        return Mono.error(new AccountLockedException(
                                "Cuenta bloqueada por múltiples intentos fallidos. Restablezca su contraseña."));
                    }
                    if (!user.isEnabled()) {
                        return Mono.error(new DisabledException(
                                "Su cuenta ha sido deshabilitada. Contacte al administrador."));
                    }
                    if (!passwordEncoder.matches(request.password(), user.getPassword())) {
                        incrementFailedAttempts(request.username());
                        LoginAttempts a = failedAttempts.get(request.username());
                        int remaining = MAX_FAILED_ATTEMPTS - (a == null ? 0 : a.count);
                        if (remaining <= 0) {
                            return Mono.error(new AccountLockedException(
                                    "Cuenta bloqueada por múltiples intentos fallidos."));
                        }
                        return Mono.error(new BadCredentialsException(
                                "La contraseña ingresada es incorrecta."));
                    }

                    clearFailedAttempts(request.username());
                    return Mono.just(new TokenResponse(jwtService.getToken(user)));
                });
    }

    @Override
    public Mono<UserResponse> register(UserRegistrationRequest request) {
        return Mono.fromCallable(() -> {
                    validateUniqueConstraints(request);
                    validateCollaboratorFields(request);
                    User user = userFactory.createUser(request.role());
                    userMapper.populateUserFromRequest(user, request,
                            passwordEncoder.encode(request.password()));
                    // Devuelve los datos del usuario creado (sin token): el colaborador
                    // inicia sesión por su cuenta. El admin no recibe credenciales ajenas.
                    return userMapper.toResponse(userRepository.save(user));
                })
                .subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<Void> forgotPassword(ForgotPasswordRequest request) {
        return Mono.fromRunnable(() ->
                transactionTemplate.executeWithoutResult(status -> {
                    User user = userRepository.findByUsername(request.username())
                            .orElseThrow(() -> new IllegalArgumentException(
                                    "El usuario ingresado no existe."));

                    if (!user.isEnabled()) {
                        throw new IllegalArgumentException(
                                "No se puede restablecer la contraseña de una cuenta deshabilitada.");
                    }

                    // Verificación de identidad: el correo debe coincidir y, para
                    // colaboradores, también el código de estudiante. Mensaje genérico
                    // para no filtrar qué dato falló.
                    verifyIdentity(user, request);

                    if (passwordEncoder.matches(request.newPassword(),
                            user.getPassword())) {
                        throw new IllegalArgumentException(
                                "La nueva contraseña no puede ser igual a la anterior.");
                    }

                    String encoded = passwordEncoder.encode(request.newPassword());
                    userRepository.updatePasswordDirect(request.username(), encoded);
                    clearFailedAttempts(request.username());
                })
        ).subscribeOn(Schedulers.boundedElastic()).then();
    }

    @Override
    public Mono<Void> logout(String authHeader) {
        return Mono.fromRunnable(() -> {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                throw new IllegalArgumentException(
                        "No se proporcionó un token de sesión válido.");
            }
            try {
                jwtService.getUsernameFromToken(authHeader.substring(7));
            } catch (ExpiredJwtException e) {
                throw new IllegalArgumentException(
                        "La sesión ya se encontraba expirada.");
            } catch (SignatureException | MalformedJwtException e) {
                throw new SecurityException("Token de sesión inválido o corrupto.");
            }
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    private void incrementFailedAttempts(String username) {
        long now = System.currentTimeMillis();
        failedAttempts.compute(username, (k, v) -> {
            if (v == null || now - v.windowStartMs > LOCK_WINDOW_MS) {
                v = new LoginAttempts();
                v.windowStartMs = now;
            }
            v.count++;
            return v;
        });
    }

    private void clearFailedAttempts(String username) {
        failedAttempts.remove(username);
    }

    private boolean isAccountLocked(String username) {
        LoginAttempts a = failedAttempts.get(username);
        if (a == null) return false;
        if (System.currentTimeMillis() - a.windowStartMs > LOCK_WINDOW_MS) {
            failedAttempts.remove(username);   // evicción de ventana expirada
            return false;
        }
        return a.count >= MAX_FAILED_ATTEMPTS;
    }

    private void verifyIdentity(User user, ForgotPasswordRequest request) {
        boolean emailMatches = user.getEmail() != null
                && user.getEmail().equalsIgnoreCase(request.email());
        boolean identityOk = emailMatches;

        if (user instanceof Collaborator collaborator) {
            boolean codeMatches = request.studentCode() != null
                    && !request.studentCode().isBlank()
                    && request.studentCode().equals(collaborator.getStudentCode());
            identityOk = emailMatches && codeMatches;
        }

        if (!identityOk) {
            throw new IllegalArgumentException(
                    "Los datos proporcionados no coinciden con la cuenta.");
        }
    }

    private void validateUniqueConstraints(UserRegistrationRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new IllegalArgumentException(
                    String.format("El usuario '%s' ya está en uso.", request.username()));
        }
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException(
                    String.format("El correo '%s' ya se encuentra registrado.",
                            request.email()));
        }
    }

    private void validateCollaboratorFields(UserRegistrationRequest request) {
        if (request.role() == Role.COLLABORATOR) {
            if (request.studentCode() == null || request.studentCode().isBlank()) {
                throw new IllegalArgumentException(
                        "El código de estudiante es obligatorio para colaboradores.");
            }
            if (request.career() == null || request.career().isBlank()) {
                throw new IllegalArgumentException(
                        "La carrera es obligatoria para colaboradores.");
            }
        }
    }
}
