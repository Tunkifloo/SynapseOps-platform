import { useCallback, useEffect, useState } from 'react'
import { Activity, CheckCircle, XCircle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'

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

export function MlflowPanel({ token, onAuthError }: MlflowPanelProps) {
    const [health, setHealth]             = useState<{ status: string; uri: string } | null>(null)
    const [experiments, setExperiments]   = useState<MlflowExperiment[]>([])
    const [models, setModels]             = useState<MlflowModel[]>([])
    const [isLoading, setIsLoading]       = useState(true)
    const [expandedModel, setExpandedModel] = useState<string | null>(null)
    const [modelVersions, setModelVersions] = useState<Record<string, MlflowModelVersion[]>>({})
    const [expandedRun, setExpandedRun]   = useState<string | null>(null)
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
            if (!onAuthError(err)) { /* silenciar */ }
        } finally {
            setIsLoading(false)
        }
    }, [token, onAuthError])

    useEffect(() => { void loadAll() }, [loadAll])

    // Expandir modelo → cargar versiones
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
            } catch { /* silenciar */ }
        }
    }

    // Expandir run → cargar métricas
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
            } catch { /* silenciar */ }
        }
    }

    return (
        <div className="space-y-6">

            {/* ── Header + Health ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Activity size={18} className="text-blue-400" />
                    <div>
                        <p className="text-sm font-semibold text-white">MLflow Tracking Server</p>
                        {health && (
                            <p className="text-[11px] text-slate-500 font-mono">{health.uri}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {health && (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                            health.status === 'UP'
                                ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                                : 'text-red-400 bg-red-400/10 border-red-400/20'
                        }`}>
              {health.status === 'UP'
                  ? <CheckCircle size={11} />
                  : <XCircle size={11} />}
                            {health.status}
            </span>
                    )}
                    <button
                        onClick={() => void loadAll()}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {isLoading && (
                <p className="text-sm text-slate-500">Loading MLflow data...</p>
            )}

            {/* ── Experiments ── */}
            {!isLoading && (
                <Card className="border-white/5 bg-black/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-white text-sm">
                            Experiments ({experiments.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {experiments.length === 0 && (
                            <p className="text-sm text-slate-500">No experiments found.</p>
                        )}
                        <div className="space-y-2">
                            {experiments.map((exp) => (
                                <div
                                    key={exp.experimentId}
                                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                                >
                                    <div>
                                        <p className="text-sm text-white font-medium">{exp.name}</p>
                                        <p className="text-[10px] text-slate-500 font-mono">id: {exp.experimentId}</p>
                                    </div>
                                    <span className="text-[10px] rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
                    {exp.lifecycleStage}
                  </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Model Registry ── */}
            {!isLoading && (
                <Card className="border-white/5 bg-black/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-white text-sm">
                            Model Registry ({models.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {models.length === 0 && (
                            <p className="text-sm text-slate-500">No registered models.</p>
                        )}
                        {models.map((model) => (
                            <div key={model.name} className="rounded-xl border border-white/5 bg-white/[0.02]">
                                {/* Fila del modelo — clickeable para expandir */}
                                <button
                                    onClick={() => void toggleModel(model.name)}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                                >
                                    <div>
                                        <p className="text-sm text-white font-medium">{model.name}</p>
                                        <p className="text-[10px] text-slate-500">
                                            Latest: <span className="text-blue-400">v{model.latestVersion}</span>
                                        </p>
                                    </div>
                                    {expandedModel === model.name
                                        ? <ChevronDown size={14} className="text-slate-400" />
                                        : <ChevronRight size={14} className="text-slate-400" />}
                                </button>

                                {/* Versiones expandidas */}
                                {expandedModel === model.name && (
                                    <div className="border-t border-white/5 px-4 py-3 space-y-2">
                                        {!modelVersions[model.name] && (
                                            <p className="text-xs text-slate-500">Loading versions...</p>
                                        )}
                                        {modelVersions[model.name]?.map((ver) => (
                                            <div key={ver.version} className="space-y-1">
                                                {/* Fila de versión */}
                                                <button
                                                    onClick={() => void toggleRun(ver.runId)}
                                                    className="w-full flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-left"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-white">v{ver.version}</span>
                                                        <span className="text-[10px] font-mono text-slate-500 truncate max-w-[140px]">
                              {ver.runId}
                            </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-slate-400">{ver.stage}</span>
                                                        {expandedRun === ver.runId
                                                            ? <ChevronDown size={12} className="text-slate-500" />
                                                            : <ChevronRight size={12} className="text-slate-500" />}
                                                    </div>
                                                </button>

                                                {/* Métricas del run expandido */}
                                                {expandedRun === ver.runId && runSummaries[ver.runId] && (
                                                    <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-3 space-y-2">
                                                        {/* Parámetros */}
                                                        {Object.keys(runSummaries[ver.runId].params).length > 0 && (
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                                                                    Parameters
                                                                </p>
                                                                <div className="grid grid-cols-2 gap-1">
                                                                    {Object.entries(runSummaries[ver.runId].params).map(([k, v]) => (
                                                                        <div key={k} className="flex gap-1 text-[11px]">
                                                                            <span className="text-slate-500">{k}:</span>
                                                                            <span className="text-white">{v}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* Métricas */}
                                                        {Object.keys(runSummaries[ver.runId].metrics).length > 0 && (
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                                                                    Metrics
                                                                </p>
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {Object.entries(runSummaries[ver.runId].metrics).map(([k, v]) => (
                                                                        <div key={k} className="rounded-lg bg-white/[0.03] p-2">
                                                                            <p className="text-[9px] text-slate-500 uppercase tracking-widest">
                                                                                {k.replace(/_/g, ' ')}
                                                                            </p>
                                                                            <p className="text-sm font-bold text-emerald-400">
                                                                                {typeof v === 'number' ? v.toFixed(4) : v}
                                                                            </p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}