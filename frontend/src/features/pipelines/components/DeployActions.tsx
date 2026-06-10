import { useMemo, useState } from 'react'
import { Info, Rocket } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { notify } from '@/shared/notify'
import { consumeDeployHandoff } from '@/features/pipelines/deployHandoff'
import { deployModel } from '@/features/deployments/api'
import type { PipelineNodeStatus } from './PipelineNode'

interface DeployActionsProps {
  token: string
  /** runId del modelo entrenado en ESTE flujo (lo fija el nodo de entrenamiento al completar). */
  flowRunId: string
  /** Versión del modelo entrenado en este flujo (informativo). */
  flowModelVersion: string
  /** Estado del nodo de entrenamiento; gobierna cuándo se habilita el despliegue. */
  trainStatus: PipelineNodeStatus
  onAuthError: (error: unknown) => boolean
}

/**
 * Nodo de Despliegue (HU-008): NO selecciona modelos manualmente. El modelo a
 * desplegar proviene del flujo (output del entrenamiento) o de un handoff desde
 * "Mis modelos". El despliegue se habilita solo cuando hay un artefacto listo.
 */
export function DeployActions({ token, flowRunId, flowModelVersion, trainStatus, onAuthError }: DeployActionsProps) {
  // Handoff desde "Mis modelos" (se consume una sola vez al montar el panel).
  const handoff = useMemo(() => consumeDeployHandoff(), [])

  const runId = handoff?.runId || flowRunId
  const modelLabel = handoff
    ? `${handoff.modelName} · v${handoff.version}`
    : flowModelVersion
      ? `v${flowModelVersion}`
      : ''
  const ready = !!runId

  const [deploying, setDeploying] = useState(false)
  const [deployedEndpoint, setDeployedEndpoint] = useState<string | null>(null)

  const handleDeploy = async () => {
    if (!runId) return
    setDeploying(true)
    notify.info('Despliegue en curso', {
      description: 'Puede tardar varios minutos (build de la imagen). Te notificaremos cuando esté listo.',
    })
    try {
      const res = await deployModel(token, runId)
      if (res.status === 'RUNNING') {
        setDeployedEndpoint(res.endpoint ?? null)
        notify.success('model-service desplegado', { description: res.endpoint ?? undefined })
      } else {
        notify.error('El despliegue no pasó el health check del model-service')
      }
    } catch (err) {
      if (!onAuthError(err)) {
        notify.error('No se pudo desplegar', { description: err instanceof Error ? err.message : undefined })
      }
    } finally {
      setDeploying(false)
    }
  }

  // Mensaje de estado, según de dónde viene el modelo y el progreso del flujo.
  let statusMsg: string
  if (handoff) statusMsg = `Modelo seleccionado desde "Mis modelos": ${modelLabel}.`
  else if (trainStatus === 'success' && flowRunId) statusMsg = `Modelo entrenado en este flujo: ${modelLabel}.`
  else if (trainStatus === 'running') statusMsg = 'Entrenando el modelo… el despliegue se habilitará al terminar.'
  else if (trainStatus === 'error') statusMsg = 'El entrenamiento falló: no hay modelo para desplegar.'
  else statusMsg = 'Aún no hay modelo. Pulsa "Iniciar flujo" para entrenar y generar el modelo a desplegar.'

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Despliegue del modelo
      </p>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3 shrink-0" />
        {statusMsg}
      </p>

      <Button
        variant="cta"
        size="sm"
        className="w-full"
        onClick={() => void handleDeploy()}
        disabled={!ready || deploying}
        loading={deploying}
        title={ready ? 'Desplegar el model-service' : 'Aún no hay un modelo listo'}
      >
        <Rocket />
        {deploying ? 'Desplegando…' : 'Desplegar'}
      </Button>

      {deployedEndpoint && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-success">
          <Info className="mt-0.5 size-3 shrink-0" />
          Desplegado. Endpoint <span className="font-mono">{deployedEndpoint}/predict</span>. Gestiónalo en “Despliegues”.
        </p>
      )}
    </div>
  )
}
