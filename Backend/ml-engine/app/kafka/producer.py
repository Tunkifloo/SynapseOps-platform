import json
import logging

from confluent_kafka import Producer

from app.config import settings

log = logging.getLogger(__name__)


class ResultProducer:

    def __init__(self) -> None:
        self._producer = Producer({
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "client.id": "ml-engine-producer",
        })

    def publish_result(self, result: dict) -> None:
        payload = json.dumps(result)
        self._producer.produce(
            topic=settings.kafka_topic_results,
            key=result.get("pipeline_id", "unknown"),
            value=payload,
            callback=self._delivery_report,
        )
        self._producer.flush()
        log.info("Resultado publicado en %s — status=%s",
                 settings.kafka_topic_results, result.get("status"))

    @staticmethod
    def _delivery_report(err, msg) -> None:
        if err:
            log.error("Error entregando mensaje Kafka: %s", err)
        else:
            log.debug("Mensaje entregado → %s [%d]",
                      msg.topic(), msg.partition())