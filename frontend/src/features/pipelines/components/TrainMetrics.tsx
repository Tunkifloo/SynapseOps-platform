import { Spinner } from '@/shared/components/ui/spinner'
import { parseMetrics, parseQualitySignals } from '@/features/executions/types'
import type { PipelineNodeStatus } from './PipelineNode'
import { QualitySignals } from './QualitySignals'

// Claves meta que NO son métricas para el grid (se muestran de otra forma).
const META_KEYS = new Set(['primary_accuracy'])

const LABELS: Record<string, string> = {
  final_accuracy: 'Accuracy (final)',
  final_loss: 'Loss (final)',
  val_accuracy: 'Val accuracy',
  val_loss: 'Val loss',
  test_accuracy: 'Test accuracy',
  test_loss: 'Test loss',
  accuracy: 'Accuracy',
  loss: 'Loss',
}

const labelFor = (key: string) => LABELS[key] ?? key
const formatValue = (key: string, value: number) =>
  /acc/i.test(key) ? `${(value * 100).toFixed(1)}%` : value.toFixed(4)

interface TrainMetricsProps {
  status?: PipelineNodeStatus
  metrics?: string | number
  runId?: string | number
}

/**
 * Evaluación de métricas del nodo de entrenamiento (HU-006).
 * Lee las métricas de la ejecución (última epoch / evaluación final del Run MLflow).
 * Muestra skeleton mientras entrena.
 */
export function TrainMetrics({ status, metrics, runId }: TrainMetricsProps) {
  if (status === 'running') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
        <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Métricas
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Spinner size="xs" /> Entrenando…
        </p>
      </div>
    )
  }

  const metricsStr = typeof metrics === 'string' ? metrics : null
  const parsed = parseMetrics(metricsStr)
  const entries = Object.entries(parsed).filter(
    ([k, v]) => !META_KEYS.has(k) && typeof v === 'number' && Number.isFinite(v)
  )
  const signals = parseQualitySignals(metricsStr)

  if (status !== 'success' || entries.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="space-y-2 rounded-xl border border-success/30 bg-success/5 p-3">
        <p className="text-xs font-semibold tracking-[0.1em] text-success uppercase">
          Métricas del último Run
        </p>
        <div className="grid grid-cols-2 gap-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-border bg-card/60 p-2">
              <p className="text-[11px] text-muted-foreground">{labelFor(key)}</p>
              <p className="font-mono text-base font-semibold text-foreground">
                {formatValue(key, value)}
              </p>
            </div>
          ))}
        </div>
        {runId && (
          <p className="truncate text-[11px] text-muted-foreground">
            Run: <span className="font-mono">{String(runId)}</span>
          </p>
        )}
      </div>
      <QualitySignals signals={signals} />
    </div>
  )
}
