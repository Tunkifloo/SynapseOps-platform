package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.entity.Admin;
import com.synapseops.orchestrator.domain.entity.Collaborator;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import org.springframework.stereotype.Component;

@Component
public class UserFactory {

    public User createUser(Role role) {
        return switch (role) {
            case ADMIN -> {
                Admin admin = new Admin();
                admin.setRole(role);
                yield admin;
            }
            case COLLABORATOR -> {
                Collaborator collaborator = new Collaborator();
                collaborator.setRole(role);
                yield collaborator;
            }
        };
    }
}
