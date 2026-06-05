import { useCallback, useEffect, useState, type ComponentType } from 'react'
import {
  Activity,
  Box,
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  getMlflowHealth,
  getMlflowModelVersions,
  getMlflowRunSummary,
  listMlflowExperiments,
  listMlflowModels,
  type MlflowExperiment,
  type MlflowModel,
  type MlflowModelVersion,
  type MlflowRunSummary,
} from '../api'

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
  const [models, setModels] = useState<MlflowModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [modelVersions, setModelVersions] = useState<Record<string, MlflowModelVersion[]>>({})
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [runSummaries, setRunSummaries] = useState<Record<string, MlflowRunSummary>>({})

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const [h, exps, mods] = await Promise.all([
        getMlflowHealth(token),
        listMlflowExperiments(token),
        listMlflowModels(token),
      ])
      setHealth({ status: h.status, uri: h.uri })
      setExperiments(exps)
      setModels(mods)
    } catch (err) {
      if (!onAuthError(err)) {
        setExperiments([])
        setModels([])
      }
    } finally {
      setIsLoading(false)
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

  const toggleModel = async (modelName: string) => {
    if (expandedModel === modelName) {
      setExpandedModel(null)
      return
    }
    setExpandedModel(modelName)
    if (!modelVersions[modelName]) {
      try {
        const versions = await getMlflowModelVersions(token, modelName)
        setModelVersions((prev) => ({ ...prev, [modelName]: versions }))
      } catch {
        setModelVersions((prev) => ({ ...prev, [modelName]: [] }))
      }
    }
  }

  const toggleRun = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null)
      return
    }
    setExpandedRun(runId)
    if (!runSummaries[runId]) {
      try {
        const summary = await getMlflowRunSummary(token, runId)
        setRunSummaries((prev) => ({ ...prev, [runId]: summary }))
      } catch {
        // El detalle del run es informativo; la lista principal sigue siendo válida.
      }
    }
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border border-blue-500/35 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
        <CardHeader className="px-6 pt-4">
          <div className="flex items-start gap-4">
            <Activity className="mt-1 h-6 w-6 text-blue-400" />
            <div>
              <CardTitle className="text-xl font-semibold text-slate-50">
                Servidor de seguimiento MLflow
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Estado actual del registro de experimentos y modelos.
              </p>
              {health?.uri && (
                <p className="mt-1 font-mono text-xs text-slate-600">{health.uri}</p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-6 pt-3">
          <div className="grid gap-4 xl:grid-cols-2">
            <EmptyRegistryCard
              title="Experimentos"
              count={experiments.length}
              icon={FlaskConical}
              emptyTitle="No hay experimentos registrados."
              emptyText="Los entrenamientos aparecerán aquí cuando se ejecuten desde un pipeline."
            >
              <div className="space-y-2">
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

            <EmptyRegistryCard
              title="Modelos registrados"
              count={models.length}
              icon={Box}
              emptyTitle="No hay modelos registrados."
              emptyText="Los modelos aparecerán aquí cuando sean registrados desde MLflow."
            >
              <div className="space-y-3">
                {models.map((model) => (
                  <div key={model.name} className="rounded-xl border border-slate-800/80 bg-slate-950/30">
                    <button
                      onClick={() => void toggleModel(model.name)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-50">{model.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Última versión: <span className="text-blue-300">v{model.latestVersion}</span>
                        </p>
                      </div>
                      {expandedModel === model.name
                        ? <ChevronDown size={16} className="text-slate-400" />
                        : <ChevronRight size={16} className="text-slate-400" />}
                    </button>

                    {expandedModel === model.name && (
                      <div className="space-y-2 border-t border-slate-800/80 px-4 py-3">
                        {!modelVersions[model.name] && (
                          <p className="text-xs text-slate-500">Cargando versiones...</p>
                        )}
                        {modelVersions[model.name]?.map((version) => (
                          <div key={version.version} className="space-y-2">
                            <button
                              onClick={() => void toggleRun(version.runId)}
                              className="flex w-full items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2 text-left"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-50">v{version.version}</span>
                                <span className="max-w-[160px] truncate font-mono text-[11px] text-slate-500">
                                  {version.runId}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400">{version.stage}</span>
                            </button>

                            {expandedRun === version.runId && runSummaries[version.runId] && (
                              <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                                <p className="text-xs font-semibold text-slate-400">Métricas</p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  {Object.entries(runSummaries[version.runId].metrics).map(([key, value]) => (
                                    <div key={key} className="rounded-lg bg-slate-900/70 p-2">
                                      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                                        {key.replace(/_/g, ' ')}
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-emerald-400">
                                        {typeof value === 'number' ? value.toFixed(4) : value}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </EmptyRegistryCard>
          </div>

          {experiments.length === 0 && models.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/25 px-6 py-4 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-300">
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-base font-semibold text-slate-50">Sin registros todavía</p>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                Cuando se ejecuten entrenamientos, los experimentos y modelos aparecerán en esta vista.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
