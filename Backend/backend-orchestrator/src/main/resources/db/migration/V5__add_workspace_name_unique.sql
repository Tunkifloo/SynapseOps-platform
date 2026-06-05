-- ══════════════════════════════════════════════════════════════════════════════
-- V5 — Unicidad del nombre de workspace por usuario
-- Respalda a nivel de BD la regla de negocio "no dos workspaces con el mismo
-- nombre para el mismo dueño", evitando duplicados ante condiciones de carrera
-- (la verificación de aplicación sigue dando un 400 amigable en el caso normal;
--  esta restricción es el backstop que el handler traduce a 409 Conflict).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces
    ADD CONSTRAINT uq_workspace_name_per_user UNIQUE (name, id_user);
