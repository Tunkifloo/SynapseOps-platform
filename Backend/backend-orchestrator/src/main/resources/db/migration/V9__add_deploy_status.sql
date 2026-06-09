-- TA-004 / TEL-02 · Resultado del último despliegue del model-service
-- (SUCCESS | FAILED). Alimenta la Tasa de Frecuencia de Despliegues Exitosos.
ALTER TABLE pipeline_executions ADD COLUMN deploy_status VARCHAR(20);
