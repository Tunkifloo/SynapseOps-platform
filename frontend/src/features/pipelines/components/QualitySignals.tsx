import { AlertTriangle, CheckCircle2, TrendingUp, ShieldCheck } from 'lucide-react'

import type { DriftItem, QualitySignals as QS } from '@/features/executions/types'

interface QualitySignalsProps {
  signals: QS
}

const sevTone: Record<string, string> = {
  none: 'border-success/30 bg-success/5 text-success-strong',
  moderate: 'border-warning/40 bg-warning/5 text-warning-strong',
  significant: 'border-destructive/40 bg-destructive/5 text-destructive-strong',
  mild: 'border-warning/40 bg-warning/5 text-warning-strong',
  high: 'border-destructive/40 bg-destructive/5 text-destructive-strong',
}

function DriftRow({ title, item, hint }: { title: string; item: DriftItem; hint: string }) {
  const tone = sevTone[item.severity] ?? sevTone.none
  const label = item.severity === 'none' ? 'estable'
    : item.severity === 'moderate' ? 'moderada' : 'significativa'
  return (
    <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="font-mono">deriva {label} · PSI {item.max_psi}</span>
      </div>
      {item.drifted && (
        <p className="mt-1 leading-relaxed text-foreground/80">
          {hint}
          {item.drifted_features.length > 0 && (
            <> Features afectadas: <span className="font-mono">{item.drifted_features.join(', ')}</span>.</>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * Señales de calidad del entrenamiento, mostradas en el panel del nodo Entrenamiento:
 *  - Overfitting (gap train/val).
 *  - Data drift: calidad del split (train vs val) y cambio del dataset (vs corrida previa).
 * Ayuda al usuario a entender si el problema viene de su data o su configuración.
 */
export function QualitySignals({ signals }: QualitySignalsProps) {
  const { overfit, driftSplit, driftRetraining, primarySplit } = signals
  const hasDrift = !!driftSplit || !!driftRetraining
  if (!overfit && !hasDrift) return null

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        <ShieldCheck className="size-3.5" /> Calidad del entrenamiento
      </p>

      {primarySplit && (
        <p className="text-[11px] text-muted-foreground">
          Métrica principal medida sobre{' '}
          <span className="font-semibold text-foreground">
            {primarySplit === 'test' ? 'test ciego (datos no vistos)' : 'validación'}
          </span>
          {primarySplit === 'val' && ' — sin test ciego en este dataset.'}
        </p>
      )}

      {/* Overfitting */}
      {overfit ? (
        <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${sevTone[overfit.severity] ?? sevTone.mild}`}>
          <TrendingUp className="mt-0.5 size-3.5 shrink-0" />
          <span>{overfit.message}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-2.5 py-2 text-[11px] text-success-strong">
          <CheckCircle2 className="size-3.5 shrink-0" /> Sin señales de overfitting (train ≈ validación).
        </div>
      )}

      {/* Drift */}
      {driftSplit && (
        <DriftRow
          title="Calidad del split (train vs val)"
          item={driftSplit}
          hint="La validación distribuye distinto del entrenamiento; revisa el balance/calidad de tus clases."
        />
      )}
      {driftRetraining && (
        <DriftRow
          title="Cambio de datos (vs corrida anterior)"
          item={driftRetraining}
          hint="Tu dataset cambió respecto al último entrenamiento de este proyecto."
        />
      )}

      {hasDrift && !driftSplit?.drifted && !driftRetraining?.drifted && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="size-3 shrink-0 text-success-strong" /> Distribuciones de datos estables.
        </p>
      )}
    </div>
  )
}
