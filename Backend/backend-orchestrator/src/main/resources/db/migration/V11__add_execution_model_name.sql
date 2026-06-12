-- Telemetría por modelo (TEL-04+): el nombre del modelo (registro MLflow) no se persistía
-- en el orquestador (solo vivía en MLflow). Se guarda en la ejecución AL LANZARLA (desde el
-- request), para agrupar las métricas de ciclo de vida por modelo sin depender de MLflow ni
-- del ml-engine. Cubre también las ejecuciones FALLIDAS (que sí tienen modelo solicitado).
ALTER TABLE pipeline_executions ADD COLUMN model_name VARCHAR(150);
