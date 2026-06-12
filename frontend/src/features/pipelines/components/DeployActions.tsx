import { useMemo } from 'react'
import { CheckCircle2, Copy, Info, Loader2, Rocket, XCircle } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { notify } from '@/shared/notify'
import { consumeDeployHandoff } from '@/features/pipelines/deployHandoff'
import type { PipelineNodeStatus } from './PipelineNode'

interface DeployActionsProps {
  /** runId del modelo entrenado en ESTE flujo (lo fija el nodo de entrenamiento al completar). */
  flowRunId: string
  /** Versión del modelo entrenado en este flujo (informativo). */
  flowModelVersion: string
  /** Métricas del entrenamiento (JSON) para mostrar el accuracy del artefacto. */
  flowMetrics: string
  /** Estado del nodo de entrenamiento; gobierna cuándo hay un modelo listo. */
  trainStatus: PipelineNodeStatus
  /** Estado EN VIVO del propio nodo de despliegue (running/success/error). */
  deployStatus: PipelineNodeStatus
  /** Endpoint del model-service una vez desplegado (vacío si no). */
  deployEndpoint: string
  /** Dispara el despliegue (handoff de "Mis modelos" o reintento). Actualiza el nodo. */
  onDeploy: (runId: string) => void
}

/** Accuracy legible desde el JSON de métricas del entrenamiento (val > final > accuracy). */
function parseAccuracy(metrics: string): string | null {
  if (!metrics) return null
  try {
    const m = JSON.parse(metrics) as Record<string, number>
    const v = m.val_accuracy ?? m.final_accuracy ?? m.accuracy
    return typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : null
  } catch {
    return null
  }
}

/**
 * Panel del Nodo de Despliegue. El despliegue es AUTOMÁTICO al terminar el flujo, así
 * que esta tarjeta es sobre todo de estado EN VIVO: muestra el artefacto generado y el
 * progreso (entrenando → desplegando → activo / error), con el endpoint resultante. El
 * botón manual solo aparece cuando hace falta: handoff desde "Mis modelos" o reintento.
 */
export function DeployActions({
  flowRunId, flowModelVersion, flowMetrics, trainStatus, deployStatus, deployEndpoint, onDeploy,
}: DeployActionsProps) {
  // Handoff desde "Mis modelos" (se consume una sola vez al montar el panel).
  const handoff = useMemo(() => consumeDeployHandoff(), [])

  const runId = handoff?.runId || flowRunId
  const modelLabel = handoff
    ? `${handoff.modelName} · v${handoff.version}`
    : flowModelVersion ? `v${flowModelVersion}` : ''
  const accuracy = parseAccuracy(flowMetrics)
  const hasModel = !!runId

  const copyEndpoint = () => {
    void navigator.clipboard?.writeText(`${deployEndpoint}/predict`)
    notify.success('Endpoint copiado')
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Despliegue del modelo
      </p>

      {/* Artefacto generado por el flujo (visible en cuanto hay modelo). */}
      {hasModel && (
        <div className="space-y-1 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Artefacto</span>
            <span className="font-medium text-foreground">{modelLabel || '—'}</span>
          </div>
          {accuracy && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Accuracy</span>
              <span className="font-mono text-success">{accuracy}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Run</span>
            <span className="font-mono text-foreground/70">{runId.slice(0, 12)}…</span>
          </div>
        </div>
      )}

      {/* Estado EN VIVO del despliegue. */}
      {deployStatus === 'running' ? (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-info">
          <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
          Desplegando el model-service… build de la imagen, puede tardar varios minutos.
          Sigue el detalle en la consola de logs.
        </p>
      ) : deployStatus === 'success' ? (
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-success">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            model-service <span className="font-semibold">activo</span>. Endpoint listo para inferencias.
          </p>
          {deployEndpoint && (
            <button
              type="button"
              onClick={copyEndpoint}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-foreground/90 transition-colors hover:bg-accent/40"
              title="Copiar endpoint"
            >
              <Copy className="size-3 shrink-0 text-primary" />
              <span className="truncate">{deployEndpoint}/predict</span>
            </button>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Pruébalo enviando una imagen desde el módulo <span className="font-medium">“Despliegues”</span>.
          </p>
        </div>
      ) : deployStatus === 'error' ? (
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            El despliegue falló. Revisa la consola de logs (el contenedor se detuvo).
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => onDeploy(runId)} disabled={!hasModel}>
            <Rocket /> Reintentar despliegue
          </Button>
        </div>
      ) : (
        // idle: explica la automatización; botón manual solo en handoff o si ya hay modelo.
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3 shrink-0" />
            {handoff
              ? `Modelo seleccionado desde "Mis modelos": ${modelLabel}. Pulsa Desplegar.`
              : trainStatus === 'running'
                ? 'Entrenando el modelo… el despliegue arrancará automáticamente al terminar.'
                : trainStatus === 'error'
                  ? 'El entrenamiento falló: no hay modelo para desplegar.'
                  : hasModel
                    ? 'Modelo listo. El despliegue es automático al terminar el flujo; si no arrancó, púlsalo.'
                    : 'El despliegue es automático: se ejecuta al terminar el entrenamiento. Conecta este nodo a Entrenamiento e inicia el flujo.'}
          </p>
          {(handoff || hasModel) && (
            <Button variant="cta" size="sm" className="w-full" onClick={() => onDeploy(runId)} disabled={!hasModel}>
              <Rocket /> Desplegar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
