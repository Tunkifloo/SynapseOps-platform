package com.synapseops.orchestrator.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.proxy.HibernateProxy;

import java.util.Objects;

@Entity
@Table(name = "ml_artifacts")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class MLArtifact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_artifact")
    private Long idArtifact;

    @Column(name = "run_id", nullable = false, unique = true, length = 100)
    private String runId;

    @Column(name = "artifact_path", nullable = false, length = 500)
    private String artifactPath;

    @Column(name = "model_version", length = 50)
    private String modelVersion;

    @Column(name = "hyperparameters", columnDefinition = "TEXT")
    private String hyperparameters;

    @Column(name = "metrics", columnDefinition = "TEXT")
    private String metrics;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_execution", unique = true)
    private PipelineExecution execution;

    @Override
    public final boolean equals(Object o) {
        if (this == o) return true;
        if (o == null) return false;
        Class<?> oClass = o instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : o.getClass();
        Class<?> thisClass = this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : this.getClass();
        if (!thisClass.equals(oClass)) return false;
        MLArtifact that = (MLArtifact) o;
        return idArtifact != null && Objects.equals(idArtifact, that.idArtifact);
    }

    @Override
    public final int hashCode() {
        return this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass().hashCode()
                : getClass().hashCode();
    }
}
