-- ══════════════════════════════════════════════════════════════════════════════
-- V6 — Persistencia de la topología del lienzo (HU-024)
-- Guarda el estado del lienzo React Flow (nodos + aristas + configuraciones) como
-- JSON serializado asociado al pipeline, para reanudar el diseño en otra sesión.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE pipelines ADD COLUMN canvas_json TEXT;
