"""
Fase 3 · Aislamiento del entrenamiento en un SUBPROCESO.

Cada job se ejecuta en un proceso hijo (multiprocessing 'spawn'). Si el entrenamiento agota la
memoria, el OOM-killer del cgroup mata al proceso que más consume (el hijo), y el **consumidor
Kafka (proceso padre, ~150 MB) SOBREVIVE** y publica un FAILED limpio — el contenedor ya no se
reinicia. Beneficios extra de 'spawn': contexto CUDA fresco por job (sin retención de VRAM/RAM
entre ejecuciones) y se evitan los problemas de fork+CUDA.
"""
import logging
import multiprocessing as mp
import time
from queue import Empty

log = logging.getLogger(__name__)

# Tope de duración de un job (s): evita que un proceso colgado bloquee el consumidor para
# siempre. Generoso (entrenamientos con backbones + HPO pueden tardar).
_JOB_TIMEOUT_S = 2 * 60 * 60   # 2 horas
_POLL_S = 2                     # cada cuánto se sondea la cola / el estado del hijo


def _job_worker(data: dict, queue) -> None:
    """Corre en el PROCESO HIJO: reconstruye el job, entrena y devuelve el resultado por la
    cola. No publica el resultado (lo hace el padre); sí emite los logs SSE durante el entreno."""
    try:
        from app.pipeline.executor import PipelineExecutor, PipelineJob
        result = PipelineExecutor().execute(PipelineJob.from_dict(data))
    except Exception as e:  # noqa: BLE001 — cualquier error → FAILED serializable
        result = {"execution_id": str(data.get("executionId", "")),
                  "status": "FAILED", "error": str(e)}
    try:
        queue.put(result)
    except Exception:  # noqa: BLE001 — resultado no serializable: al menos un FAILED mínimo
        queue.put({"execution_id": str(data.get("executionId", "")),
                   "status": "FAILED", "error": "Resultado del entrenamiento no serializable."})


def _failed(exec_id: str, error: str) -> dict:
    return {"execution_id": exec_id, "status": "FAILED", "error": error}


def run_job_isolated(data: dict, executor=None) -> dict:
    """Ejecuta el job en un subproceso aislado y devuelve su resultado. Si el subproceso muere
    sin entregar resultado (OOM-kill / crash duro), devuelve un FAILED claro SIN tumbar al
    consumidor. Si multiprocessing no está disponible, cae a ejecución en proceso (fallback)."""
    exec_id = str(data.get("executionId", ""))
    try:
        ctx = mp.get_context("spawn")
        queue = ctx.Queue()
        proc = ctx.Process(target=_job_worker, args=(data, queue), daemon=False)
        proc.start()
    except Exception as e:  # noqa: BLE001 — sin aislamiento: ejecutar en proceso (último recurso)
        log.warning("Aislamiento por subproceso no disponible (%s); ejecuto en proceso.", e)
        from app.pipeline.executor import PipelineExecutor, PipelineJob
        ex = executor or PipelineExecutor()
        return ex.execute(PipelineJob.from_dict(data))

    result = None
    started = time.time()
    # Sondea la cola; un OOM-kill del hijo no deja nada → se detecta por `not is_alive()`.
    while True:
        try:
            result = queue.get(timeout=_POLL_S)
            break
        except Empty:
            if not proc.is_alive():
                break  # el hijo terminó sin poner resultado → OOM/crash
            if time.time() - started > _JOB_TIMEOUT_S:
                log.error("Job %s superó el tiempo límite; se termina el subproceso.", exec_id)
                proc.terminate()
                break

    proc.join(10)
    if proc.is_alive():
        proc.terminate()
        proc.join(5)

    if result is not None:
        return result

    log.error("Job %s: el subproceso terminó sin resultado (exitcode=%s) — posible OOM.",
              exec_id, proc.exitcode)
    return _failed(exec_id,
                   "El entrenamiento se detuvo por falta de memoria u otro fallo de recursos. "
                   "El servicio sigue activo; reintenta con menos batch size, menor tamaño de "
                   "imagen o menos imágenes.")
