import { Spinner } from '@/shared/components/ui/spinner'
import { FieldHelp } from '@/shared/components/FieldHelp'
import { parseMetrics, parseQualitySignals } from '@/features/executions/types'
import { groupMetricsBySplit, formatMetric, metricHelp } from '@/features/executions/metricsGroups'
import type { PipelineNodeStatus } from './PipelineNode'
import { QualitySignals } from './QualitySignals'

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
  const groups = groupMetricsBySplit(parsed)
  const signals = parseQualitySignals(metricsStr)

  if (status !== 'success' || groups.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
        <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Métricas del último Run
        </p>
        {/* Agrupadas por split con color semántico (Train/Val/Test/Drift) — Ticket UX-3. */}
        {groups.map((g) => (
          <div key={g.key} className="space-y-1.5">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {g.title}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {g.entries.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-card/60 p-2">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-[11px] text-muted-foreground" title={label}>{label}</p>
                    {metricHelp(label) && <FieldHelp text={metricHelp(label) as string} label={label} />}
                  </div>
                  <p className={`font-mono text-base font-semibold ${g.valueClass}`}>
                    {formatMetric(label, value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
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
