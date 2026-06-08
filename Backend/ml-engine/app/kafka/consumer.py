import json
import logging
import threading

from confluent_kafka import Consumer, KafkaError, KafkaException, TopicPartition

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

    # Intentos máximos por offset antes de descartar el mensaje (anti poison-pill).
    MAX_RETRIES = 3

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
        # Reintentos acotados por offset: evita el poison-pill (reprocesar para
        # siempre un mensaje irrecuperable) y la pérdida silenciosa (saltarlo sin
        # control). Tras MAX_RETRIES intentos fallidos del MISMO offset, se commitea
        # para liberar la partición. Mientras tanto se hace seek() para reprocesar
        # exactamente el mismo registro (poll() ya habría avanzado la posición).
        last_failed_offset = None
        failure_count = 0

        while self._running:
            try:
                msg = self._consumer.poll(timeout=1.0)

                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    raise KafkaException(msg.error())

                offset_key = (msg.topic(), msg.partition(), msg.offset())
                try:
                    self._process_message(msg)
                    self._consumer.commit(message=msg)
                    last_failed_offset = None
                    failure_count = 0
                except Exception as e:
                    failure_count = failure_count + 1 if offset_key == last_failed_offset else 1
                    last_failed_offset = offset_key

                    if failure_count >= self.MAX_RETRIES:
                        log.error(
                            "Mensaje irrecuperable tras %d intentos (offset=%s): %s — "
                            "se descarta (commit) para no bloquear la partición",
                            failure_count, offset_key, e,
                        )
                        self._consumer.commit(message=msg)
                        last_failed_offset = None
                        failure_count = 0
                    else:
                        log.warning(
                            "Fallo procesando mensaje (intento %d/%d, offset=%s): %s — "
                            "se reintentará",
                            failure_count, self.MAX_RETRIES, offset_key, e,
                        )
                        # Rebobinar al offset fallido para reprocesar el mismo registro.
                        self._consumer.seek(
                            TopicPartition(msg.topic(), msg.partition(), msg.offset())
                        )
                        time.sleep(2)   # backoff antes de reintentar

            except Exception as e:
                log.exception("Error en consume loop: %s", e)
                time.sleep(2)   # backoff ante errores del propio consumidor

    def _process_message(self, msg) -> None:
        raw = msg.value().decode("utf-8")
        log.info("Mensaje recibido: %s", raw[:200])

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

        # Publicar resultado — execution_id incluido para que el backend actualice BD
        self._producer.publish_result(result)