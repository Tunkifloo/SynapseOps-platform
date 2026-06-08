package com.synapseops.orchestrator.service.auth;

import com.synapseops.orchestrator.domain.dto.request.ForgotPasswordRequest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.SignupRequest;
import com.synapseops.orchestrator.domain.dto.request.UserRegistrationRequest;
import com.synapseops.orchestrator.domain.dto.response.TokenResponse;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import reactor.core.publisher.Mono;

public interface AuthService {
    Mono<TokenResponse> login(LoginRequest request);
    Mono<UserResponse> register(UserRegistrationRequest request);
    Mono<UserResponse> signup(SignupRequest request);
    Mono<Void> forgotPassword(ForgotPasswordRequest request);
    Mono<Void> logout(String authHeader);
}
