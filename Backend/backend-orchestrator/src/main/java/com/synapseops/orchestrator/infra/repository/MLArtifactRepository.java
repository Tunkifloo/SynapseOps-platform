package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.MLArtifact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MLArtifactRepository extends JpaRepository<MLArtifact, Long> {
    Optional<MLArtifact> findByRunId(String runId);
    Optional<MLArtifact> findByExecution_IdExecution(Long executionId);

    /**
     * Run IDs de todos los artefactos pertenecientes a un workspace, resueltos
     * a través del grafo de propiedad artifact → execution → pipeline → workspace.
     * Es la frontera de confianza: MLflow no tiene auth, el orquestador decide
     * qué modelos puede ver/gestionar cada usuario (HU-027 RBAC).
     */
    @Query("""
            SELECT a.runId FROM MLArtifact a
            WHERE a.execution.pipeline.workspace.idWorkspace = :workspaceId
            """)
    List<String> findRunIdsByWorkspace(@Param("workspaceId") Long workspaceId);

    /**
     * Artefactos de un workspace (run_id + métricas persistidas) para enriquecer
     * el listado de versiones sin depender de los endpoints ADMIN de MLflow.
     */
    @Query("""
            SELECT a FROM MLArtifact a
            WHERE a.execution.pipeline.workspace.idWorkspace = :workspaceId
            """)
    List<MLArtifact> findByWorkspace(@Param("workspaceId") Long workspaceId);
}
