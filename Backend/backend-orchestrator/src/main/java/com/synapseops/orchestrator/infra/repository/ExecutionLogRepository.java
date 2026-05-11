package com.synapseops.orchestrator.infra.repository;

import com.synapseops.orchestrator.domain.entity.ExecutionLog;
import com.synapseops.orchestrator.domain.entity.LogLevel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ExecutionLogRepository extends JpaRepository<ExecutionLog, Long> {
    List<ExecutionLog> findByExecution_IdExecutionOrderByTimestampAsc(Long executionId);
    List<ExecutionLog> findByExecution_IdExecutionAndLevel(Long executionId, LogLevel level);
}
