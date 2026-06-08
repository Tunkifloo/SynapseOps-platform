import { Play } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { notify } from '@/shared/notify'
import { validateConfig, type NodeConfig } from '@/features/pipelines/nodeConfig'

interface TrainActionsProps {
  config: NodeConfig
  canRun: boolean
  onExecute: (config: NodeConfig) => void
}

/**
 * Acción del nodo de Entrenamiento (HU-005): valida la config y lanza la
 * ejecución real (backend → Kafka → ml-engine → MLflow). El estado del nodo
 * se actualiza en vivo desde el lienzo (polling).
 */
export function TrainActions({ config, canRun, onExecute }: TrainActionsProps) {
  const handle = () => {
    const error = validateConfig('train', config)
    if (error) {
      notify.error('Configuración inválida', { description: error })
      return
    }
    onExecute(config)
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Ejecución
      </p>
      {!canRun && (
        <p className="text-xs text-warning">
          Asigna un dataset al proyecto (nodo de Ingesta) antes de entrenar.
        </p>
      )}
      <Button variant="cta" size="sm" className="w-full" disabled={!canRun} onClick={handle}>
        <Play />
        Ejecutar entrenamiento
      </Button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Publica el job en Kafka → el ml-engine entrena y registra en MLflow. El estado del nodo se
        actualiza en vivo.
      </p>
    </div>
  )
}
