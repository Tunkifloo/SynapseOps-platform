package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.domain.dto.request.PasswordUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserProfileUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserUpdateRequest;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.mapper.UserMapper;
import com.synapseops.orchestrator.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.List;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
    public Flux<UserResponse> getAllUsers() {
        return fetchUsers(userRepository::findByEnabledTrue);
    }

    @Override
    public Flux<UserResponse> getUsersByRole(Role role) {
        return fetchUsers(() -> userRepository.findByRoleAndEnabledTrue(role));
    }

    public Flux<UserResponse> getDisabledUsers() {
        return fetchUsers(userRepository::findByEnabledFalse);
    }

    @Override
    public Mono<UserResponse> getUserById(Long id) {
        return Mono.fromCallable(() ->
                userRepository.findByIdUserAndEnabledTrue(id)
                        .map(userMapper::toResponse)
                        .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado con ID: " + id))
        ).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<UserResponse> getProfile(String username) {
        return Mono.fromCallable(() ->
                userRepository.findByUsername(username)
                        .map(userMapper::toResponse)
                        .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username))
        ).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<UserResponse> updateUserByAdmin(Long id, UserUpdateRequest request) {
        return Mono.fromCallable(() -> {
            User user = userRepository.findById(id)
                    .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado con ID: " + id));

            if (request.email() != null
                    && !request.email().equals(user.getEmail())
                    && userRepository.existsByEmail(request.email())) {
                throw new IllegalArgumentException(
                        String.format("El correo '%s' ya está siendo utilizado por otro usuario.", request.email()));
            }

            userMapper.updateEntityFromRequest(user, request);
            return userMapper.toResponse(userRepository.save(user));
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<UserResponse> updateMyProfile(String username, UserProfileUpdateRequest request) {
        return Mono.fromCallable(() -> {
            User user = userRepository.findByUsername(username)
                    .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username));
            userMapper.updateEntityFromProfileRequest(user, request);
            return userMapper.toResponse(userRepository.save(user));
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<Void> updatePassword(String username, PasswordUpdateRequest request) {
        return Mono.fromRunnable(() -> {
            User user = userRepository.findByUsername(username)
                    .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username));

            if (!user.isEnabled()) {
                throw new DisabledException("Su cuenta está deshabilitada.");
            }
            if (!passwordEncoder.matches(request.currentPassword(), user.getPassword())) {
                throw new IllegalArgumentException("La contraseña actual ingresada es incorrecta.");
            }
            if (passwordEncoder.matches(request.newPassword(), user.getPassword())) {
                throw new IllegalArgumentException("La nueva contraseña no puede ser igual a la actual.");
            }

            user.setPassword(passwordEncoder.encode(request.newPassword()));
            userRepository.save(user);
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    @Override
    public Mono<Void> toggleUserStatus(Long id) {
        return Mono.fromRunnable(() -> {
            User user = userRepository.findById(id)
                    .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado con ID: " + id));
            user.setEnabled(!user.isEnabled());
            userRepository.save(user);
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    private Flux<UserResponse> fetchUsers(Supplier<List<User>> query) {
        return Mono.fromCallable(query::get)
                .subscribeOn(Schedulers.boundedElastic())
                .flatMapMany(Flux::fromIterable)
                .map(userMapper::toResponse);
    }
}