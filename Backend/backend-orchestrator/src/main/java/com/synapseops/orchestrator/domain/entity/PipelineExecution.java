package com.synapseops.orchestrator.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.proxy.HibernateProxy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Entity
@Table(name = "pipeline_executions")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class PipelineExecution {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_execution")
    private Long idExecution;

    @Column(name = "started_at",
            columnDefinition = "TIMESTAMP(3)")
    private LocalDateTime startedAt;

    @Column(name = "finished_at",
            columnDefinition = "TIMESTAMP(3)")
    private LocalDateTime finishedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExecutionStatus status = ExecutionStatus.PENDING;

    @Column(name = "mlflow_run_id", length = 100)
    private String mlflowRunId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_pipeline", nullable = false)
    private Pipeline pipeline;

    @OneToMany(mappedBy = "execution",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("timestamp ASC")
    private List<ExecutionLog> logs = new ArrayList<>();

    @OneToOne(mappedBy = "execution",
            cascade = CascadeType.ALL,
            fetch = FetchType.LAZY)
    private MLArtifact artifact;

    // ── Métodos de negocio ──────────────────────────────────────────────────

    public void start() {
        this.status = ExecutionStatus.RUNNING;
        this.startedAt = LocalDateTime.now();
    }

    public void complete(String mlflowRunId) {
        this.status = ExecutionStatus.COMPLETED;
        this.finishedAt = LocalDateTime.now();
        this.mlflowRunId = mlflowRunId;
    }

    public void fail() {
        this.status = ExecutionStatus.FAILED;
        this.finishedAt = LocalDateTime.now();
    }

    @Override
    public final boolean equals(Object o) {
        if (this == o) return true;
        if (o == null) return false;
        Class<?> oClass = o instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : o.getClass();
        Class<?> thisClass = this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : this.getClass();
        if (!thisClass.equals(oClass)) return false;
        PipelineExecution that = (PipelineExecution) o;
        return idExecution != null && Objects.equals(idExecution, that.idExecution);
    }

    @Override
    public final int hashCode() {
        return this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass().hashCode()
                : getClass().hashCode();
    }
}
