-- TEL-01 · Process Tracker: marcas de tiempo del ciclo de vida (OE4 · "Process/Lifecycle").
-- Alimentan los indicadores de TEL-02 (Tiempo de Re-entrenamiento y Lead Time de Despliegue)
-- sobre la muestra estadística de 30-31 proyectos. Sin pasos manuales: ml-engine emite las
-- dos primeras (ingesta/entrenamiento) y el orquestador las dos últimas (aprobación/despliegue).
ALTER TABLE pipeline_executions ADD COLUMN ingestion_started_at  TIMESTAMP(3);  -- t_inicio_ingesta
ALTER TABLE pipeline_executions ADD COLUMN training_finished_at   TIMESTAMP(3);  -- t_fin_entrenamiento
ALTER TABLE pipeline_executions ADD COLUMN model_approved_at      TIMESTAMP(3);  -- t_aprobacion_modelo
ALTER TABLE pipeline_executions ADD COLUMN deploy_available_at    TIMESTAMP(3);  -- t_despliegue_disponible
