package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    List<User> findByEnabledTrue();
    List<User> findByRoleAndEnabledTrue(Role role);
    List<User> findByEnabledFalse();
    boolean existsByEmail(String email);
    boolean existsByUsername(String username);

    @Modifying
    @Query(value = "UPDATE users SET password = :password WHERE username = :username", nativeQuery = true)
    int updatePasswordDirect(@Param("username") String username, @Param("password") String password);
}
