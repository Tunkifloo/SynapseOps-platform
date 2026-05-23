import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RefreshCw, CheckCircle, XCircle, Clock, Activity } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import { getExecution, launchExecution, listExecutions } from '../api'
import {
    defaultExecutionForm,
    parseMetrics,
    type ExecutionFormData,
    type ExecutionSummary,
} from '../types'

const POLL_INTERVAL_MS = 4000

interface ExecutionPanelProps {
    token: string
    workspaceId: number
    pipelineId: number
    pipelineName: string
    hasDataset: boolean
    onAuthError: (error: unknown) => boolean
}

// Badge de estado con color e ícono según el status
function StatusBadge({ status }: { status: string }) {
    const cfg = {
        PENDING:   { cls: 'text-slate-400 bg-slate-400/10 border-slate-400/20', Icon: Clock,       label: 'Pending'   },
        RUNNING:   { cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20',    Icon: RefreshCw,   label: 'Running'   },
        COMPLETED: { cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', Icon: CheckCircle, label: 'Completed' },
        FAILED:    { cls: 'text-red-400 bg-red-400/10 border-red-400/20',       Icon: XCircle,     label: 'Failed'    },
    }[status] ?? { cls: 'text-slate-400 bg-slate-400/10 border-slate-400/20', Icon: Clock, label: status }

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <cfg.Icon size={11} className={status === 'RUNNING' ? 'animate-spin' : ''} />
            {cfg.label}
    </span>
    )
}

// Grilla de métricas del modelo entrenado
function MetricsGrid({ metrics }: { metrics: Record<string, number> }) {
    const entries = Object.entries(metrics)
    if (entries.length === 0) return null
    return (
        <div className="grid grid-cols-2 gap-2 mt-3">
            {entries.map(([key, value]) => (
                <div key={key} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate">
                        {key.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-1 text-lg font-bold text-white">
                        {typeof value === 'number' ? value.toFixed(4) : String(value)}
                    </p>
                </div>
            ))}
        </div>
    )
}

export function ExecutionPanel({
                                   token,
                                   workspaceId,
                                   pipelineId,
                                   pipelineName,
                                   hasDataset,
                                   onAuthError,
                               }: ExecutionPanelProps) {
    const [form, setForm]               = useState<ExecutionFormData>(defaultExecutionForm())
    const [executions, setExecutions]   = useState<ExecutionSummary[]>([])
    const [isLaunching, setIsLaunching] = useState(false)
    const [isLoading, setIsLoading]     = useState(false)
    const [error, setError]             = useState<string | null>(null)
    const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null)

    // Carga ejecuciones existentes del pipeline seleccionado
    const loadExecutions = useCallback(async () => {
        setIsLoading(true)
        try {
            const data = await listExecutions(token, workspaceId, pipelineId)
            setExecutions(data)
        } catch (err) {
            if (!onAuthError(err)) setError('No se pudieron cargar las ejecuciones.')
        } finally {
            setIsLoading(false)
        }
    }, [token, workspaceId, pipelineId, onAuthError])

    // Cargar al montar o cuando cambie de pipeline
    useEffect(() => {
        void loadExecutions()
    }, [loadExecutions])

    // Polling automático cada 4 segundos mientras haya ejecuciones RUNNING
    useEffect(() => {
        const hasRunning = executions.some(
            (e) => e.status === 'RUNNING' || e.status === 'PENDING',
        )

        if (hasRunning && !pollRef.current) {
            pollRef.current = setInterval(async () => {
                try {
                    const running = executions.filter(
                        (e) => e.status === 'RUNNING' || e.status === 'PENDING',
                    )
                    for (const exec of running) {
                        const updated = await getExecution(
                            token, workspaceId, pipelineId, exec.idExecution,
                        )
                        setExecutions((prev) =>
                            prev.map((e) => (e.idExecution === updated.idExecution ? updated : e)),
                        )
                    }
                } catch {
                    // silenciar errores de polling
                }
            }, POLL_INTERVAL_MS)
        }

        if (!hasRunning && pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current)
                pollRef.current = null
            }
        }
    }, [executions, token, workspaceId, pipelineId])

    // Lanzar un nuevo entrenamiento
    const handleLaunch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!hasDataset) {
            setError('Asigna un dataset al workspace antes de ejecutar.')
            return
        }
        setIsLaunching(true)
        setError(null)
        try {
            const launched = await launchExecution(token, workspaceId, pipelineId, {
                framework:    form.framework,
                architecture: form.architecture,
                epochs:       Number(form.epochs),
                batchSize:    Number(form.batchSize),
                learningRate: Number(form.learningRate),
                numClasses:   Number(form.numClasses),
                modelName:    form.modelName,
            })
            setExecutions((prev) => [launched, ...prev])
        } catch (err) {
            if (!onAuthError(err)) {
                setError(err instanceof Error ? err.message : 'Error al lanzar ejecución.')
            }
        } finally {
            setIsLaunching(false)
        }
    }

    // Helper para actualizar un campo del formulario
    const setField = (key: keyof ExecutionFormData, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }))
    }

    return (
        <div className="space-y-4 col-span-2">

            {/* ── Formulario de lanzamiento ─────────────────────────────────────── */}
            <Card className="border-white/5 bg-black/20">
                <CardHeader className="pb-3">
                    <CardTitle className="text-white flex items-center gap-2 text-sm">
                        <Activity size={15} className="text-blue-400" />
                        Launch Training —{' '}
                        <span className="text-slate-400 font-normal">{pipelineName}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Aviso si no hay dataset */}
                    {!hasDataset && (
                        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
                            ⚠ Asigna un dataset al workspace antes de ejecutar.
                        </div>
                    )}

                    <form onSubmit={(e) => void handleLaunch(e)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">

                            {/* Framework */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Framework
                                </label>
                                <select
                                    value={form.framework}
                                    onChange={(ev) =>
                                        setField('framework', ev.target.value)
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value="tensorflow">TensorFlow</option>
                                    <option value="pytorch">PyTorch</option>
                                </select>
                            </div>

                            {/* Model Name */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Model Name
                                </label>
                                <Input
                                    value={form.modelName}
                                    onChange={(ev) => setField('modelName', ev.target.value)}
                                    className="bg-white/[0.04] border-white/10 text-white"
                                />
                            </div>

                            {/* Epochs */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Epochs
                                </label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={form.epochs}
                                    onChange={(ev) => setField('epochs', ev.target.value)}
                                    className="bg-white/[0.04] border-white/10 text-white"
                                />
                            </div>

                            {/* Batch Size */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Batch Size
                                </label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={form.batchSize}
                                    onChange={(ev) => setField('batchSize', ev.target.value)}
                                    className="bg-white/[0.04] border-white/10 text-white"
                                />
                            </div>

                            {/* Learning Rate */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Learning Rate
                                </label>
                                <Input
                                    type="number"
                                    step="0.0001"
                                    value={form.learningRate}
                                    onChange={(ev) => setField('learningRate', ev.target.value)}
                                    className="bg-white/[0.04] border-white/10 text-white"
                                />
                            </div>

                            {/* Num Classes */}
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    Num Classes
                                </label>
                                <Input
                                    type="number"
                                    min={2}
                                    value={form.numClasses}
                                    onChange={(ev) => setField('numClasses', ev.target.value)}
                                    className="bg-white/[0.04] border-white/10 text-white"
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-2 text-sm text-red-300">
                                {error}
                            </p>
                        )}

                        <Button
                            type="submit"
                            disabled={isLaunching || !hasDataset}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                        >
                            {isLaunching ? (
                                <>
                                    <RefreshCw size={14} className="animate-spin mr-2" />
                                    Launching...
                                </>
                            ) : (
                                <>
                                    <Play size={14} className="mr-2" />
                                    Launch Training
                                </>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* ── Historial de ejecuciones ─────────────────────────────────────── */}
            <Card className="border-white/5 bg-black/20">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-white text-sm">Execution History</CardTitle>
                    <button
                        onClick={() => void loadExecutions()}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </CardHeader>
                <CardContent className="space-y-3">
                    {isLoading && (
                        <p className="text-sm text-slate-500">Loading executions...</p>
                    )}
                    {!isLoading && executions.length === 0 && (
                        <p className="text-sm text-slate-500">
                            No executions yet. Launch a training run above.
                        </p>
                    )}

                    {executions.map((exec) => {
                        const metrics = parseMetrics(exec.metrics)
                        return (
                            <div
                                key={exec.idExecution}
                                className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-2"
                            >
                                {/* Header: id + status */}
                                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    exec_{exec.idExecution}
                  </span>
                                    <StatusBadge status={exec.status} />
                                </div>

                                {/* MLflow Run ID */}
                                {exec.mlflowRunId && (
                                    <p className="text-[11px] text-slate-500 font-mono truncate">
                                        run: {exec.mlflowRunId}
                                    </p>
                                )}

                                {/* Model version */}
                                {exec.modelVersion && (
                                    <p className="text-[11px] text-slate-400">
                                        Model version:{' '}
                                        <span className="text-white font-medium">v{exec.modelVersion}</span>
                                    </p>
                                )}

                                {/* Métricas */}
                                <MetricsGrid metrics={metrics} />

                                {/* Timestamps */}
                                {exec.startedAt && (
                                    <p className="text-[10px] text-slate-600">
                                        {new Date(exec.startedAt).toLocaleString()}
                                        {exec.finishedAt &&
                                            ` → ${new Date(exec.finishedAt).toLocaleString()}`}
                                    </p>
                                )}
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>
    )
}