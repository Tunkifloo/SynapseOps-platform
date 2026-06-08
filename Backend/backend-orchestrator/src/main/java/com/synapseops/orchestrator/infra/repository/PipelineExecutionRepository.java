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
}
