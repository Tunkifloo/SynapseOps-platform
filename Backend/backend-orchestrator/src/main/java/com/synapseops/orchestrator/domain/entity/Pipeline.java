package com.synapseops.orchestrator.domain.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.proxy.HibernateProxy;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@JsonIgnoreProperties({"executions", "workspace", "hibernateLazyInitializer"})
@Entity
@Table(name = "pipelines")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class Pipeline {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_pipeline")
    private Long idPipeline;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PipelineStatus status = PipelineStatus.DRAFT;

    /** Topología del lienzo React Flow (nodos + aristas + configs) serializada (HU-024). */
    @Column(name = "canvas_json", columnDefinition = "TEXT")
    private String canvasJson;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_workspace", nullable = false)
    private Workspace workspace;

    @OneToMany(mappedBy = "pipeline",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("orderIndex ASC")
    private List<PipelineNode> nodes = new ArrayList<>();

    @OneToMany(mappedBy = "pipeline",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("startedAt DESC")
    private List<PipelineExecution> executions = new ArrayList<>();

    @Override
    public final boolean equals(Object o) {
        if (this == o) return true;
        if (o == null) return false;
        Class<?> oClass = o instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : o.getClass();
        Class<?> thisClass = this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : this.getClass();
        if (!thisClass.equals(oClass)) return false;
        Pipeline that = (Pipeline) o;
        return idPipeline != null && Objects.equals(idPipeline, that.idPipeline);
    }

    @Override
    public final int hashCode() {
        return this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass().hashCode()
                : getClass().hashCode();
    }
}
