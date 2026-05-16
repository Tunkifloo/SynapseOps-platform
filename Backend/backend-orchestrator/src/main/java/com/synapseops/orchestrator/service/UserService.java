package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.PasswordUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserProfileUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserUpdateRequest;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.Role;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface UserService {
    Flux<UserResponse> getAllUsers();
    Flux<UserResponse> getUsersByRole(Role role);
    Flux<UserResponse> getDisabledUsers();
    Mono<UserResponse> getUserById(Long id);
    Mono<UserResponse> getProfile(String username);
    Mono<UserResponse> updateUserByAdmin(Long id, UserUpdateRequest request);
    Mono<UserResponse> updateMyProfile(String username, UserProfileUpdateRequest request);
    Mono<Void> updatePassword(String username, PasswordUpdateRequest request);
    Mono<Void> toggleUserStatus(Long id);
}
