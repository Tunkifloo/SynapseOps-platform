from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Kafka
    kafka_bootstrap_servers: str = "localhost:9094"
    kafka_group_id: str = "ml-engine-group"
    kafka_topic_requests: str = "mlops.pipeline.requests"
    kafka_topic_results: str = "mlops.pipeline.results"
    kafka_topic_logs: str = "mlops.pipeline.logs"

    # MLflow
    mlflow_tracking_uri: str = "http://localhost:5000"

    # Storage
    storage_base_path: str = "./storage-dev"

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "info"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()