package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.Workspace;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface WorkspaceRepository extends JpaRepository<Workspace, Long> {

    @EntityGraph(attributePaths = {"user"})
    List<Workspace> findAll();

    @EntityGraph(attributePaths = {"user"})
    Optional<Workspace> findById(Long id);

    @EntityGraph(attributePaths = {"user"})
    List<Workspace> findByUser_IdUserAndUser_EnabledTrue(Long userId);

    boolean existsByNameAndUser_IdUser(String name, Long userId);
}