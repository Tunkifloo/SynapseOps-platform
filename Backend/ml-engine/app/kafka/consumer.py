import json
import logging
import threading

from confluent_kafka import Consumer, KafkaError, KafkaException

from app.config import settings
from app.pipeline.executor import PipelineExecutor, PipelineJob
from app.kafka.producer import ResultProducer
from app.api.metrics import pipeline_runs_total, training_duration_seconds
import time

log = logging.getLogger(__name__)


class PipelineConsumer:
    """
    Consumidor Kafka — procesa un mensaje a la vez (serial).
    Corre en un thread daemon para no bloquear el event loop de FastAPI.
    """

    def __init__(self) -> None:
        self._consumer = Consumer({
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "group.id": settings.kafka_group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        })
        self._executor = PipelineExecutor()
        self._producer = ResultProducer()
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._running = True
        self._consumer.subscribe([settings.kafka_topic_requests])
        self._thread = threading.Thread(
            target=self._consume_loop,
            daemon=True,
            name="kafka-consumer",
        )
        self._thread.start()
        log.info("Kafka consumer iniciado → tópico: %s",
                 settings.kafka_topic_requests)

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        self._consumer.close()
        log.info("Kafka consumer detenido")

    def _consume_loop(self) -> None:
        while self._running:
            try:
                msg = self._consumer.poll(timeout=1.0)

                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    raise KafkaException(msg.error())

                self._process_message(msg)
                self._consumer.commit(message=msg)

            except Exception as e:
                log.exception("Error en consume loop: %s", e)
                time.sleep(2)   # backoff antes de reintentar

    def _process_message(self, msg) -> None:
        raw = msg.value().decode("utf-8")
        log.info("Mensaje recibido desde Kafka: %s", raw[:200])

        try:
            data = json.loads(raw)
            job = PipelineJob.from_dict(data)
        except (json.JSONDecodeError, KeyError) as e:
            log.error("Mensaje inválido, descartando: %s", e)
            return

        start = time.time()
        result = self._executor.execute(job)
        elapsed = time.time() - start

        # Métricas Prometheus
        pipeline_runs_total.labels(status=result["status"]).inc()
        training_duration_seconds.labels(
            framework=data.get("framework", "tensorflow")
        ).observe(elapsed)

        self._producer.publish_result(result)