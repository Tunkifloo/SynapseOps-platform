-- ══════════════════════════════════════════════════════════════════════════════
-- V3 — PipelineExecutions, ExecutionLogs y MLArtifacts
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Pipeline Executions ───────────────────────────────────────────────────────
CREATE TABLE pipeline_executions (
                                     id_execution   BIGSERIAL    PRIMARY KEY,

    -- TIMESTAMP(3) = precisión de milisegundos (criterio Project Charter)
                                     started_at     TIMESTAMP(3),
                                     finished_at    TIMESTAMP(3),

                                     status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING',

    -- Run ID del experimento en MLflow (ADR-007)
                                     mlflow_run_id  VARCHAR(100),

                                     id_pipeline    BIGINT       NOT NULL,

                                     CONSTRAINT fk_executions_pipeline
                                         FOREIGN KEY (id_pipeline) REFERENCES pipelines(id_pipeline)
                                             ON DELETE CASCADE,

                                     CONSTRAINT chk_executions_status
                                         CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED'))
);

COMMENT ON TABLE  pipeline_executions               IS 'Historial de ejecuciones. Un pipeline puede ejecutarse N veces.';
COMMENT ON COLUMN pipeline_executions.started_at    IS 'Inicio con precisión de ms — criterio Project Charter';
COMMENT ON COLUMN pipeline_executions.finished_at   IS 'Fin con precisión de ms — criterio Project Charter';
COMMENT ON COLUMN pipeline_executions.mlflow_run_id IS 'Run ID de MLflow para recuperar métricas y artefactos (ADR-007)';

CREATE INDEX idx_executions_pipeline   ON pipeline_executions(id_pipeline);
CREATE INDEX idx_executions_status     ON pipeline_executions(status);
CREATE INDEX idx_executions_mlflow_run ON pipeline_executions(mlflow_run_id);
CREATE INDEX idx_executions_started_at ON pipeline_executions(started_at DESC);

-- ── Execution Logs ────────────────────────────────────────────────────────────
CREATE TABLE execution_logs (
                                id_log        BIGSERIAL     PRIMARY KEY,
                                timestamp     TIMESTAMP(3)  NOT NULL DEFAULT NOW(),
                                level         VARCHAR(10)   NOT NULL DEFAULT 'INFO',
                                message       TEXT          NOT NULL,
                                id_execution  BIGINT        NOT NULL,

                                CONSTRAINT fk_logs_execution
                                    FOREIGN KEY (id_execution) REFERENCES pipeline_executions(id_execution)
                                        ON DELETE CASCADE,

                                CONSTRAINT chk_logs_level
                                    CHECK (level IN ('DEBUG','INFO','WARN','ERROR'))
);

COMMENT ON TABLE  execution_logs IS 'Logs persistidos de cada ejecución. Complementa el streaming SSE en tiempo real (ADR-002).';

CREATE INDEX idx_logs_execution  ON execution_logs(id_execution);
CREATE INDEX idx_logs_level      ON execution_logs(level);
CREATE INDEX idx_logs_timestamp  ON execution_logs(timestamp DESC);

-- ── ML Artifacts ──────────────────────────────────────────────────────────────
-- Relación (0..1): una ejecución produce como máximo 1 artefacto
CREATE TABLE ml_artifacts (
                              id_artifact     BIGSERIAL     PRIMARY KEY,
                              run_id          VARCHAR(100)  NOT NULL,
                              artifact_path   VARCHAR(500)  NOT NULL,
                              model_version   VARCHAR(50),
                              hyperparameters TEXT,
                              metrics         TEXT,
                              id_execution    BIGINT        UNIQUE,

                              CONSTRAINT fk_artifacts_execution
                                  FOREIGN KEY (id_execution) REFERENCES pipeline_executions(id_execution)
                                      ON DELETE SET NULL,

                              CONSTRAINT uq_artifacts_run_id
                                  UNIQUE (run_id)
);

COMMENT ON TABLE  ml_artifacts                IS 'Artefactos ML (.h5/.pkl) registrados en el MLflow Model Registry.';
COMMENT ON COLUMN ml_artifacts.run_id         IS 'Run ID único de MLflow — fuente de verdad del artefacto (ADR-007)';
COMMENT ON COLUMN ml_artifacts.artifact_path  IS 'Ruta dentro del artifact store: /mlflow/artifacts/.../model.h5';
COMMENT ON COLUMN ml_artifacts.model_version  IS 'Versión en el Model Registry de MLflow';
COMMENT ON COLUMN ml_artifacts.id_execution   IS 'NULL si la ejecución fue eliminada — el artefacto persiste';

CREATE INDEX idx_artifacts_run_id ON ml_artifacts(run_id);