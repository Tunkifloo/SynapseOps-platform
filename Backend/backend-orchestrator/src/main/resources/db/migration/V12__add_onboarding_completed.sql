-- Onboarding guiado (Ticket UX-5): marca si el usuario ya completó u omitió el
-- recorrido de bienvenida. Default FALSE → los usuarios existentes lo verán una vez.
ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
