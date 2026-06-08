/**
 * Handoff "Desplegar este modelo" (HU-027 → HU-028).
 *
 * El Model Registry no despliega contenedores (eso es Sprint 3); su acción
 * "Desplegar" selecciona un Run ID y lo entrega al nodo de Despliegue del
 * Pipeline Builder. Usamos localStorage como canal desacoplado entre vistas
 * para no acoplar el Registry al estado del canvas.
 */
const KEY = 'synapseops:deploy-handoff'

export interface DeployHandoff {
  runId: string
  modelName: string
  version: string
}

export function setDeployHandoff(payload: DeployHandoff): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* almacenamiento no disponible — el handoff es opcional */
  }
}

export function consumeDeployHandoff(): DeployHandoff | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    localStorage.removeItem(KEY)
    return JSON.parse(raw) as DeployHandoff
  } catch {
    return null
  }
}
