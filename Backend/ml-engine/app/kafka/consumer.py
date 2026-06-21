import json
import logging
import os
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
            # El entrenamiento corre SÍNCRONO en este hilo, bloqueando poll() durante
            # minutos. Con el default (5 min) Kafka expulsaba al consumidor a mitad de
            # entrenamientos largos (_MAX_POLL_EXCEEDED → rebalanceos). Se eleva a 2 h.
            # (Los heartbeats van por un hilo de fondo en librdkafka, así que el
            #  session.timeout no se ve afectado por el procesamiento lento.)
            "max.poll.interval.ms": 7200000,
        })
        self._executor = PipelineExecutor()
        self._producer = ResultProducer()
        self._running = False
        self._thread: threading.Thread | None = None
        # Marcador de "trabajo en vuelo" en el volumen persistente /storage: si el
        # proceso muere a mitad de un entrenamiento, al reiniciar se publica FAILED
        # para no dejar la ejecución colgada (ver _recover_inflight).
        self._inflight_path = os.path.join(settings.storage_base_path, ".ml_engine_inflight")

    def start(self) -> None:
        # Recuperación de un trabajo que quedó a medias por un reinicio del proceso.
        self._recover_inflight()
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
        # AT-MOST-ONCE para trabajos de entrenamiento: se commitea el offset ANTES de
        # procesar. Un entrenamiento dura minutos; si el ml-engine se reinicia durante
        # (o después de) un trabajo cuyo offset no se commiteó, el mensaje NO debe
        # re-consumirse → evita el "re-entrenamiento fantasma" al reiniciar la infra.
        # Si un trabajo falla, NO se reintenta automáticamente (reintentar = re-entrenar
        # un trabajo caro); el usuario lo re-dispara desde el lienzo.
        while self._running:
            try:
                msg = self._consumer.poll(timeout=1.0)

                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    raise KafkaException(msg.error())

                # Commit ANTES de procesar → este registro nunca se vuelve a leer.
                self._consumer.commit(message=msg)
                # Marca el trabajo como "en vuelo": si el proceso muere durante el
                # entrenamiento, al reiniciar se publicará FAILED para esta ejecución.
                self._mark_inflight(self._peek_execution_id(msg))
                try:
                    self._process_message(msg)
                except Exception as e:
                    log.exception(
                        "Fallo procesando el job (offset=%s); NO se reintenta para evitar "
                        "re-entrenamientos: %s",
                        (msg.topic(), msg.partition(), msg.offset()), e,
                    )
                finally:
                    # El trabajo terminó (éxito o fallo manejado) → ya no está en vuelo.
                    self._clear_inflight()

            except Exception as e:
                log.exception("Error en consume loop: %s", e)
                time.sleep(2)   # backoff ante errores del propio consumidor

    @staticmethod
    def _peek_execution_id(msg) -> str:
        """executionId del mensaje (sin procesarlo) para el marcador de recuperación."""
        try:
            return str(json.loads(msg.value().decode("utf-8")).get("executionId", "")).strip()
        except Exception:  # noqa: BLE001
            return ""

    def _mark_inflight(self, execution_id: str) -> None:
        if not execution_id:
            return
        try:
            os.makedirs(os.path.dirname(self._inflight_path), exist_ok=True)
            with open(self._inflight_path, "w", encoding="utf-8") as f:
                f.write(execution_id)
        except Exception as e:  # noqa: BLE001 — el marcador nunca debe romper el flujo
            log.debug("No se pudo escribir el marcador in-flight: %s", e)

    def _clear_inflight(self) -> None:
        try:
            if os.path.exists(self._inflight_path):
                os.remove(self._inflight_path)
        except Exception as e:  # noqa: BLE001
            log.debug("No se pudo limpiar el marcador in-flight: %s", e)

    def _recover_inflight(self) -> None:
        """Si el proceso murió a mitad de un entrenamiento (OOM, reinicio del contenedor),
        el offset YA se commiteó (at-most-once) y el mensaje no se reentrega. Para no dejar
        la ejecución colgada en 'RUNNING' para siempre, se publica un resultado FAILED al
        arrancar, dando feedback al usuario para que reintente el flujo. La idempotencia del
        orquestador ignora este FAILED si la ejecución ya hubiera terminado."""
        try:
            if not os.path.exists(self._inflight_path):
                return
            with open(self._inflight_path, encoding="utf-8") as f:
                execution_id = f.read().strip()
            if execution_id:
                log.warning("Recuperación: la ejecución %s quedó a medias por un reinicio del "
                            "ml-engine; publicando FAILED.", execution_id)
                self._producer.publish_result({
                    "execution_id": execution_id,
                    "status": "FAILED",
                    "error": "El ml-engine se reinició durante el entrenamiento (posible falta de "
                             "memoria o reinicio del contenedor). El flujo no continuó; reintenta.",
                })
        except Exception as e:  # noqa: BLE001
            log.warning("No se pudo recuperar la ejecución en vuelo: %s", e)
        finally:
            self._clear_inflight()

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
        # Fase 3 · aislamiento en subproceso: un OOM/crash del entrenamiento mata solo al hijo
        # (el que más memoria consume), NO a este consumidor → el contenedor ya no reinicia.
        # Fallback a en-proceso si multiprocessing falla o si se desactiva por env.
        if settings.isolate_training:
            from app.pipeline.runner import run_job_isolated
            result = run_job_isolated(data, self._executor)
        else:
            result = self._executor.execute(job)
        elapsed = time.time() - start

        # Métricas Prometheus
        pipeline_runs_total.labels(status=result["status"]).inc()
        training_duration_seconds.labels(
            framework=data.get("framework", "tensorflow")
        ).observe(elapsed)

        # Publicar resultado — execution_id incluido para que el backend actualice BD
        self._producer.publish_result(result)