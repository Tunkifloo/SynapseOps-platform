import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Activity, FlaskConical } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  getMlflowHealth,
  getMlflowModelVersions,
  getMlflowRunSummary,
  listMlflowExperiments,
  listMlflowModels,
  type MlflowExperiment,
} from '../api'
import { ModelRegistry, type RegistryApi } from './ModelRegistry'

interface MlflowPanelProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

interface EmptyRegistryCardProps {
  title: string
  count: number
  icon: ComponentType<{ className?: string }>
  emptyTitle: string
  emptyText: string
  children?: React.ReactNode
}

function EmptyRegistryCard({
  title,
  count,
  icon: Icon,
  emptyTitle,
  emptyText,
  children,
}: EmptyRegistryCardProps) {
  return (
    <Card className="rounded-2xl border border-slate-700/70 bg-slate-950/25 py-0 shadow-sm shadow-black/20">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
          </div>
          <span className="rounded-full bg-blue-500/10 px-4 py-1.5 text-sm font-semibold text-slate-100">
            {count}
          </span>
        </div>

        {count === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-blue-400/25 bg-slate-950/20 px-6 py-5 text-center">
            <Icon className="mb-3 h-9 w-9 text-slate-600" />
            <p className="text-base font-semibold text-slate-50">{emptyTitle}</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

export function MlflowPanel({ token, onAuthError }: MlflowPanelProps) {
  const [health, setHealth] = useState<{ status: string; uri: string } | null>(null)
  const [experiments, setExperiments] = useState<MlflowExperiment[]>([])

  const loadAll = useCallback(async () => {
    try {
      const [h, exps] = await Promise.all([
        getMlflowHealth(token),
        listMlflowExperiments(token),
      ])
      setHealth({ status: h.status, uri: h.uri })
      setExperiments(exps)
    } catch (err) {
      if (!onAuthError(err)) {
        setExperiments([])
      }
    }
  }, [token, onAuthError])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { void loadAll() }, [token, onAuthError])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    const refresh = () => { void loadAll() }
    window.addEventListener('synapseops:refresh-mlflow', refresh)
    return () => window.removeEventListener('synapseops:refresh-mlflow', refresh)
  }, [loadAll])

  const isUp = health?.status === 'UP'

  // Consola global de gobierno: solo-lectura (DN-3). Sin acciones de escritura;
  // las métricas se resuelven vía run-summary (permitido a ADMIN).
  const globalApi: RegistryApi = useMemo(() => ({
    listModels: () => listMlflowModels(token),
    getVersions: (name) => getMlflowModelVersions(token, name),
    getMetrics: async (runId) => {
      const summary = await getMlflowRunSummary(token, runId)
      const m = summary.metrics
      return {
        accuracy: m.test_accuracy ?? m.val_accuracy ?? m.accuracy ?? null,
        loss:     m.test_loss ?? m.val_loss ?? m.loss ?? null,
      }
    },
  }), [token])

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-blue-500/35 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
        <CardHeader className="px-6 pt-4">
          <div className="flex items-start gap-4">
            <Activity className={`mt-1 h-6 w-6 ${isUp ? 'text-emerald-400' : 'text-slate-500'}`} />
            <div>
              <CardTitle className="text-xl font-semibold text-slate-50">
                Servidor de seguimiento MLflow
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Estado del registro de experimentos y modelos.
                {health && (
                  <span className={`ml-2 font-semibold ${isUp ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isUp ? 'Operativo' : 'No disponible'}
                  </span>
                )}
              </p>
              {health?.uri && (
                <p className="mt-1 font-mono text-xs text-slate-600">{health.uri}</p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-6 pt-3">
          <EmptyRegistryCard
            title="Experimentos"
            count={experiments.length}
            icon={FlaskConical}
            emptyTitle="No hay experimentos registrados."
            emptyText="Los entrenamientos aparecerán aquí cuando se ejecuten desde un pipeline."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {experiments.map((experiment) => (
                <div
                  key={experiment.experimentId}
                  className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/30 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-50">{experiment.name}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">id: {experiment.experimentId}</p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-400">
                    {experiment.lifecycleStage}
                  </span>
                </div>
              ))}
            </div>
          </EmptyRegistryCard>

          <ModelRegistry api={globalApi} onAuthError={onAuthError} />
        </CardContent>
      </Card>
    </div>
  )
}
