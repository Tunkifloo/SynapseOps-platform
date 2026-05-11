-- ══════════════════════════════════════════════════════════════════════════════
-- V1 — Jerarquía de usuarios
-- JPA InheritanceType.JOINED: tabla base users + subtablas admins/collaborators
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE users (
                       id_user           BIGSERIAL       PRIMARY KEY,
                       username          VARCHAR(50)     NOT NULL,
                       password          VARCHAR(255)    NOT NULL,
                       role              VARCHAR(20)     NOT NULL,
                       name              VARCHAR(100),
                       paternal_surname  VARCHAR(100),
                       maternal_surname  VARCHAR(100),
                       email             VARCHAR(150)    NOT NULL,
                       phone             VARCHAR(20),
                       enabled           BOOLEAN         NOT NULL DEFAULT TRUE,

                       CONSTRAINT uq_users_username  UNIQUE (username),
                       CONSTRAINT uq_users_email     UNIQUE (email),
                       CONSTRAINT uq_users_phone     UNIQUE (phone),
                       CONSTRAINT chk_users_role     CHECK  (role IN ('ADMIN', 'COLLABORATOR'))
);

COMMENT ON TABLE  users                  IS 'Tabla base — JPA JOINED inheritance. Contiene todos los usuarios del sistema.';
COMMENT ON COLUMN users.role             IS 'Discriminador de subclase: ADMIN | COLLABORATOR';
COMMENT ON COLUMN users.password         IS 'Hash BCrypt de la contraseña';
COMMENT ON COLUMN users.enabled          IS 'Soft delete: false = cuenta desactivada';

-- ── Admin ─────────────────────────────────────────────────────────────────────
-- Sin columnas propias — PK compartida con users (JOINED)
CREATE TABLE admins (
                        id_user  BIGINT  PRIMARY KEY,

                        CONSTRAINT fk_admins_users
                            FOREIGN KEY (id_user) REFERENCES users(id_user)
                                ON DELETE CASCADE
);

COMMENT ON TABLE admins IS 'Subtabla JOINED para Admin. Sin atributos adicionales.';

-- ── Collaborator ──────────────────────────────────────────────────────────────
CREATE TABLE collaborators (
                               id_user       BIGINT        PRIMARY KEY,
                               student_code  VARCHAR(20)   NOT NULL,
                               career        VARCHAR(150),

                               CONSTRAINT fk_collaborators_users
                                   FOREIGN KEY (id_user) REFERENCES users(id_user)
                                       ON DELETE CASCADE,

                               CONSTRAINT uq_collaborators_student_code
                                   UNIQUE (student_code)
);

COMMENT ON TABLE  collaborators              IS 'Subtabla JOINED para Collaborator (estudiante).';
COMMENT ON COLUMN collaborators.student_code IS 'Código de matrícula (ej: U20210001)';

-- ── Índices ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_users_role    ON users(role);
CREATE INDEX idx_users_enabled ON users(enabled);