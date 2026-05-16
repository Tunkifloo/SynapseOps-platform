package com.synapseops.orchestrator.service.auth;

import com.synapseops.orchestrator.domain.dto.request.ForgotPasswordRequest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.UserRegistrationRequest;
import com.synapseops.orchestrator.domain.dto.response.TokenResponse;
import reactor.core.publisher.Mono;

public interface AuthService {
    Mono<TokenResponse> login(LoginRequest request);
    Mono<TokenResponse> register(UserRegistrationRequest request);
    Mono<Void> forgotPassword(ForgotPasswordRequest request);
    Mono<Void> logout(String authHeader);
}
