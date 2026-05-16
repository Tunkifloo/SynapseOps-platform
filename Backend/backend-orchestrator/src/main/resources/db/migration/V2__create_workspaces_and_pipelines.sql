-- ══════════════════════════════════════════════════════════════════════════════
-- V2 — Workspaces, Pipelines y PipelineNodes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Workspaces ────────────────────────────────────────────────────────────────
CREATE TABLE workspaces (
                            id_workspace  BIGSERIAL     PRIMARY KEY,
                            name          VARCHAR(100)  NOT NULL,
                            description   TEXT,
                            created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
                            id_user       BIGINT        NOT NULL,

                            CONSTRAINT fk_workspaces_users
                                FOREIGN KEY (id_user) REFERENCES users(id_user)
                                    ON DELETE CASCADE
);

COMMENT ON TABLE  workspaces          IS 'Espacio de trabajo aislado por estudiante. Contiene los pipelines del proyecto.';
COMMENT ON COLUMN workspaces.id_user  IS 'Propietario del workspace';

CREATE INDEX idx_workspaces_user ON workspaces(id_user);

-- ── Pipelines ─────────────────────────────────────────────────────────────────
CREATE TABLE pipelines (
                           id_pipeline   BIGSERIAL     PRIMARY KEY,
                           name          VARCHAR(100)  NOT NULL,
                           status        VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
                           id_workspace  BIGINT        NOT NULL,

                           CONSTRAINT fk_pipelines_workspace
                               FOREIGN KEY (id_workspace) REFERENCES workspaces(id_workspace)
                                   ON DELETE CASCADE,

                           CONSTRAINT chk_pipelines_status
                               CHECK (status IN ('DRAFT','READY','RUNNING','COMPLETED','FAILED'))
);

COMMENT ON TABLE  pipelines              IS 'Pipeline MLOps. Contiene los nodos del DAG de orquestación.';
COMMENT ON COLUMN pipelines.status       IS 'Estado del pipeline: DRAFT → READY → RUNNING → COMPLETED | FAILED';
COMMENT ON COLUMN pipelines.id_workspace IS 'Workspace al que pertenece';

CREATE INDEX idx_pipelines_workspace ON pipelines(id_workspace);
CREATE INDEX idx_pipelines_status    ON pipelines(status);

-- ── Pipeline Nodes ────────────────────────────────────────────────────────────
CREATE TABLE pipeline_nodes (
                                id_node      BIGSERIAL    PRIMARY KEY,
                                node_type    VARCHAR(30)  NOT NULL,
                                order_index  INTEGER      NOT NULL,
                                config_json  TEXT,
                                status       VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
                                id_pipeline  BIGINT       NOT NULL,

                                CONSTRAINT fk_nodes_pipeline
                                    FOREIGN KEY (id_pipeline) REFERENCES pipelines(id_pipeline)
                                        ON DELETE CASCADE,

                                CONSTRAINT chk_nodes_type
                                    CHECK (node_type IN (
                                                         'DATA_INGESTION','PREPROCESSING',
                                                         'DATASET_SPLIT','TRAINING','DEPLOYMENT'
                                        )),

                                CONSTRAINT chk_nodes_status
                                    CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),

                                CONSTRAINT uq_node_type_per_pipeline
                                    UNIQUE (id_pipeline, node_type)
);

COMMENT ON TABLE  pipeline_nodes             IS 'Nodos del DAG MLOps. Cada nodo representa una fase del ciclo de vida.';
COMMENT ON COLUMN pipeline_nodes.node_type   IS 'DATA_INGESTION | PREPROCESSING | DATASET_SPLIT | TRAINING | DEPLOYMENT';
COMMENT ON COLUMN pipeline_nodes.order_index IS 'Posición en el DAG (0 = primero)';
COMMENT ON COLUMN pipeline_nodes.config_json IS 'Configuración del nodo serializada como JSON';

CREATE INDEX idx_nodes_pipeline ON pipeline_nodes(id_pipeline);
CREATE INDEX idx_nodes_order    ON pipeline_nodes(id_pipeline, order_index);