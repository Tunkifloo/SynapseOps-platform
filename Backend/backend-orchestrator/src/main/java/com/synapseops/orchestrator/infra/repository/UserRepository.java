package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

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

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE User u SET u.enabled = NOT u.enabled WHERE u.idUser = :id")
    int toggleEnabled(@Param("id") Long id);

    @Modifying
    @Query(value = "UPDATE users SET password = :password WHERE username = :username", nativeQuery = true)
    int updatePasswordDirect(@Param("username") String username, @Param("password") String password);
}
