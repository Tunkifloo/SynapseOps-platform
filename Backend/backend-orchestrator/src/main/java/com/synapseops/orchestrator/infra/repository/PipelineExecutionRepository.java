package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.ExecutionStatus;
import com.synapseops.orchestrator.domain.entity.PipelineExecution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PipelineExecutionRepository extends JpaRepository<PipelineExecution, Long> {
    Optional<PipelineExecution> findByMlflowRunId(String mlflowRunId);
    List<PipelineExecution> findByStatus(ExecutionStatus status);

    /** Nº de ejecuciones de un pipeline (sin tocar colecciones lazy fuera de sesión). */
    long countByPipeline_IdPipeline(Long pipelineId);

    @Query("""
            SELECT e FROM PipelineExecution e
            JOIN FETCH e.pipeline p
            JOIN FETCH p.workspace w
            JOIN FETCH w.user u
            LEFT JOIN FETCH e.artifact
            WHERE e.idExecution = :id
            """)
    Optional<PipelineExecution> findByIdWithDetails(@Param("id") Long id);

    @Query("""
            SELECT e FROM PipelineExecution e
            JOIN FETCH e.pipeline p
            JOIN FETCH p.workspace w
            JOIN FETCH w.user u
            LEFT JOIN FETCH e.artifact
            WHERE p.idPipeline = :pipelineId
            ORDER BY e.startedAt DESC
            """)
    List<PipelineExecution> findByPipelineIdWithDetails(@Param("pipelineId") Long pipelineId);

    /** HU-029 · Despliegues del usuario (con detalles cargados para mapear sin lazy). */
    @Query("""
            SELECT e FROM PipelineExecution e
            JOIN FETCH e.pipeline p
            JOIN FETCH p.workspace w
            JOIN FETCH w.user u
            LEFT JOIN FETCH e.artifact
            WHERE u.username = :username AND e.deployContainerName IS NOT NULL
            ORDER BY e.idExecution DESC
            """)
    List<PipelineExecution> findDeploymentsByUsername(@Param("username") String username);

    /** TEL-02 · Todas las ejecuciones del usuario (con detalles) para los indicadores de ciclo de vida. */
    @Query("""
            SELECT e FROM PipelineExecution e
            JOIN FETCH e.pipeline p
            JOIN FETCH p.workspace w
            JOIN FETCH w.user u
            LEFT JOIN FETCH e.artifact
            WHERE u.username = :username
            ORDER BY e.idExecution DESC
            """)
    List<PipelineExecution> findAllByUsernameWithDetails(@Param("username") String username);

    /** Analítica global (ADMIN): TODAS las ejecuciones con detalles, para la muestra OE4 (30-31). */
    @Query("""
            SELECT e FROM PipelineExecution e
            JOIN FETCH e.pipeline p
            JOIN FETCH p.workspace w
            JOIN FETCH w.user u
            LEFT JOIN FETCH e.artifact
            ORDER BY e.idExecution DESC
            """)
    List<PipelineExecution> findAllWithDetails();
}
