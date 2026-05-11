package com.synapseops.orchestrator.service.auth;

import com.synapseops.orchestrator.domain.dto.request.ForgotPasswordRequest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.UserRegistrationRequest;
import com.synapseops.orchestrator.domain.dto.response.TokenResponse;
import com.synapseops.orchestrator.domain.entity.User;
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
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final UserFactory userFactory;
    private final UserMapper userMapper;

    @Override
    public Mono<TokenResponse> login(LoginRequest request) {
        return Mono.fromCallable(() ->
                        userRepository.findByUsername(request.username())
                                .orElseThrow(() -> new IllegalArgumentException("El usuario ingresado no existe en el sistema."))
                )
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(user -> {
                    if (!user.isEnabled()) {
                        return Mono.error(new DisabledException("Su cuenta ha sido deshabilitada. Contacte al administrador."));
                    }
                    if (!passwordEncoder.matches(request.password(), user.getPassword())) {
                        return Mono.error(new BadCredentialsException("La contraseña ingresada es incorrecta."));
                    }
                    return Mono.just(new TokenResponse(jwtService.getToken(user)));
                });
    }

    @Override
    public Mono<TokenResponse> register(UserRegistrationRequest request) {
        return Mono.fromCallable(() -> {
                    validateUniqueConstraints(request);
                    User user = userFactory.createUser(request.role());
                    userMapper.populateUserFromRequest(user, request, passwordEncoder.encode(request.password()));
                    userRepository.save(user);
                    return new TokenResponse(jwtService.getToken(user));
                })
                .subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<Void> forgotPassword(ForgotPasswordRequest request) {
        return Mono.fromRunnable(() -> {
                    User user = userRepository.findByUsername(request.username())
                            .orElseThrow(() -> new IllegalArgumentException("El usuario ingresado no existe."));

                    if (!user.isEnabled()) {
                        throw new IllegalArgumentException("No se puede restablecer la contraseña de una cuenta deshabilitada.");
                    }
                    if (passwordEncoder.matches(request.newPassword(), user.getPassword())) {
                        throw new IllegalArgumentException("La nueva contraseña no puede ser igual a la anterior.");
                    }

                    user.setPassword(passwordEncoder.encode(request.newPassword()));
                    userRepository.save(user);
                })
                .subscribeOn(Schedulers.boundedElastic())
                .then();
    }

    @Override
    public Mono<Void> logout(String authHeader) {
        return Mono.fromRunnable(() -> {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                throw new IllegalArgumentException("No se proporcionó un token de sesión válido.");
            }
            try {
                jwtService.getUsernameFromToken(authHeader.substring(7));
            } catch (ExpiredJwtException e) {
                throw new IllegalArgumentException("La sesión ya se encontraba expirada.");
            } catch (SignatureException | MalformedJwtException e) {
                throw new SecurityException("Token de sesión inválido o corrupto.");
            }
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    private void validateUniqueConstraints(UserRegistrationRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new IllegalArgumentException(
                    String.format("El usuario '%s' ya está en uso.", request.username()));
        }
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException(
                    String.format("El correo '%s' ya se encuentra registrado.", request.email()));
        }
    }
}
