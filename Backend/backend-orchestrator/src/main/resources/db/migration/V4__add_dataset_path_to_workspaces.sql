-- ══════════════════════════════════════════════════════════════════════════════
-- V4 — Agrega dataset_path a workspaces
-- Almacena la ruta absoluta del dataset activo del workspace (EN-007)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces
    ADD COLUMN dataset_path VARCHAR(500);

COMMENT ON COLUMN workspaces.dataset_path
    IS 'Ruta absoluta del dataset activo: /storage/{userId}/{workspaceId}/datasets/{filename}';