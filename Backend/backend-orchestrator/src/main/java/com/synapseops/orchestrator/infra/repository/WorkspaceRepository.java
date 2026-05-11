package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.Workspace;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WorkspaceRepository extends JpaRepository<Workspace, Long> {
    List<Workspace> findByUser_IdUserAndUser_EnabledTrue(Long userId);
    boolean existsByNameAndUser_IdUser(String name, Long userId);
}