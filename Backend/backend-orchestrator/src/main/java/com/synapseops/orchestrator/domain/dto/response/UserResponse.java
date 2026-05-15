package com.synapseops.orchestrator.domain.dto.response;

import com.synapseops.orchestrator.domain.entity.Role;

public record UserResponse(
        Long idUser,
        String username,
        String name,
        String email,
        Role role,
        String paternalSurname,
        String maternalSurname,
        String phone,
        boolean enabled,
        String studentCode,
        String carrer
) {}
