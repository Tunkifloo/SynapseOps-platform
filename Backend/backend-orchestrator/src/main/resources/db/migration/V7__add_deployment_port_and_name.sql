-- TA-002 (asignación dinámica de puerto) y TA-003 (nombre único de contenedor)
-- del despliegue del model-service. Permiten concurrencia segura de varios
-- model-services en el host sin colisión de puertos ni de nombres.
ALTER TABLE pipeline_executions
    ADD COLUMN deploy_port           INTEGER,
    ADD COLUMN deploy_container_name VARCHAR(150);
