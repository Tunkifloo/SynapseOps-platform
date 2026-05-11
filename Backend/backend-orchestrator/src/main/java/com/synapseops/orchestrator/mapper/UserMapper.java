package com.synapseops.orchestrator.mapper;

import com.synapseops.orchestrator.domain.dto.request.UserProfileUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserRegistrationRequest;
import com.synapseops.orchestrator.domain.dto.request.UserUpdateRequest;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.User;
import org.springframework.stereotype.Component;

@Component
public class UserMapper {

    public void populateUserFromRequest(User user, UserRegistrationRequest request, String encodedPassword) {
        user.setUsername(request.username());
        user.setPassword(encodedPassword);
        user.setName(request.name());
        user.setPaternalSurname(request.paternalSurname());
        user.setMaternalSurname(request.maternalSurname());
        user.setEmail(request.email());
        user.setPhone(request.phone());
        user.setRole(request.role());

    }

    public UserResponse toResponse(User user) {

        return new UserResponse(
                user.getIdUser(),
                user.getUsername(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.getPaternalSurname(),
                user.getMaternalSurname(),
                user.getPhone(),
                user.isEnabled()
        );
    }

    public void updateEntityFromRequest(User user, UserUpdateRequest request) {
        if (request.name() != null) user.setName(request.name());
        if (request.paternalSurname() != null) user.setPaternalSurname(request.paternalSurname());
        if (request.maternalSurname() != null) user.setMaternalSurname(request.maternalSurname());
        if (request.email() != null) user.setEmail(request.email());
        if (request.phone() != null) user.setPhone(request.phone());

    }

    public void updateEntityFromProfileRequest(User user, UserProfileUpdateRequest request) {
        if (request.name() != null) user.setName(request.name());
        if (request.paternalSurname() != null) user.setPaternalSurname(request.paternalSurname());
        if (request.maternalSurname() != null) user.setMaternalSurname(request.maternalSurname());
        if (request.phone() != null) user.setPhone(request.phone());
    }
}

