package com.synapseops.orchestrator.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.proxy.HibernateProxy;

import java.util.Objects;

@Entity
@Table(name = "pipeline_nodes",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_node_type_per_pipeline",
                columnNames = {"id_pipeline", "node_type"}
        ))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class PipelineNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_node")
    private Long idNode;

    @Enumerated(EnumType.STRING)
    @Column(name = "node_type", nullable = false, length = 30)
    private NodeType nodeType;

    @Column(name = "order_index", nullable = false)
    private Integer orderIndex;

    @Column(name = "config_json", columnDefinition = "TEXT")
    private String configJson;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NodeStatus status = NodeStatus.PENDING;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_pipeline", nullable = false)
    private Pipeline pipeline;

    @Override
    public final boolean equals(Object o) {
        if (this == o) return true;
        if (o == null) return false;
        Class<?> oClass = o instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : o.getClass();
        Class<?> thisClass = this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass() : this.getClass();
        if (!thisClass.equals(oClass)) return false;
        PipelineNode that = (PipelineNode) o;
        return idNode != null && Objects.equals(idNode, that.idNode);
    }

    @Override
    public final int hashCode() {
        return this instanceof HibernateProxy hp
                ? hp.getHibernateLazyInitializer().getPersistentClass().hashCode()
                : getClass().hashCode();
    }
}
