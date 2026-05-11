package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    List<User> findByEnabledTrue();
    List<User> findByRoleAndEnabledTrue(Role role);
    Optional<User> findByIdUserAndEnabledTrue(Long id);
    List<User> findByEnabledFalse();
    boolean existsByEmail(String email);
    boolean existsByUsername(String username);
}
