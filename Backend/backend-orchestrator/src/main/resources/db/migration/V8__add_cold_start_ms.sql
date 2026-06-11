-- TA-001 · Cold start del model-service: milisegundos desde que se levanta el
-- contenedor (docker run) hasta el primer HTTP 200 en /health. Métrica de
-- "Lead Time de Despliegue" para el sistema de telemetría (TEL-01).
ALTER TABLE pipeline_executions ADD COLUMN cold_start_ms BIGINT;
