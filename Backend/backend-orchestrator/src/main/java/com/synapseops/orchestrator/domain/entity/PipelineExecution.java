package com.synapseops.orchestrator.domain.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.proxy.HibernateProxy;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@JsonIgnoreProperties({"logs", "pipeline", "artifact", "hibernateLazyInitializer"})
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

    @Column(name = "model_name", length = 150)   // nombre del modelo (registro MLflow), telemetría por modelo
    private String modelName;

    // ── Despliegue del model-service (TA-002 puerto dinámico · TA-003 nombre único) ──
    @Column(name = "deploy_port")
    private Integer deployPort;

    @Column(name = "deploy_container_name", length = 150)
    private String deployContainerName;

    @Column(name = "cold_start_ms")          // TA-001 · ms hasta el primer /health 200
    private Long coldStartMs;

    @Column(name = "deploy_status", length = 20)   // TA-004/TEL-02 · SUCCESS | FAILED
    private String deployStatus;

    // ── TEL-01 · Process Tracker — marcas de tiempo del ciclo de vida (OE4) ──────────
    @Column(name = "ingestion_started_at", columnDefinition = "TIMESTAMP(3)")
    private LocalDateTime ingestionStartedAt;   // t_inicio_ingesta (emitido por ml-engine)

    @Column(name = "training_finished_at", columnDefinition = "TIMESTAMP(3)")
    private LocalDateTime trainingFinishedAt;   // t_fin_entrenamiento (emitido por ml-engine)

    @Column(name = "model_approved_at", columnDefinition = "TIMESTAMP(3)")
    private LocalDateTime modelApprovedAt;      // t_aprobacion_modelo (orquestador, al registrar)

    @Column(name = "deploy_available_at", columnDefinition = "TIMESTAMP(3)")
    private LocalDateTime deployAvailableAt;    // t_despliegue_disponible (orquestador, health 200)

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_pipeline", nullable = false)
    private Pipeline pipeline;

    @JsonIgnore
    @OneToMany(mappedBy = "execution",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("timestamp ASC")
    private List<ExecutionLog> logs = new ArrayList<>();

    @JsonIgnore
    @OneToOne(mappedBy = "execution",
            cascade = CascadeType.ALL,
            fetch = FetchType.LAZY)
    private MLArtifact artifact;

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
