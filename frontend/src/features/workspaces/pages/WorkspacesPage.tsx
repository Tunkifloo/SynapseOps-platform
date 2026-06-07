import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Database,
  FolderPlus,
  History,
  Layers,
  Network,
  Pencil,
  Trash2,
  Workflow,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Spinner } from '@/shared/components/ui/spinner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { notify } from '@/shared/notify'
import {
  createWorkspace,
  deleteWorkspace,
  listMyWorkspaces,
  listWorkspacePipelines,
  updateWorkspace,
} from '@/features/workspaces/api'
import { listWorkspaceModels } from '@/features/mlflow/api'
import { listExecutions } from '@/features/executions/api'
import { parseMetrics, type ExecutionSummary } from '@/features/executions/types'
import { WorkspaceForm } from '@/features/workspaces/components/WorkspaceForm'
import {
  emptyWorkspaceForm,
  type PipelineSummary,
  type WorkspaceFormData,
  type WorkspaceSummary,
} from '@/features/workspaces/types'
import { useAppStore } from '@/store/useAppStore'

interface WorkspacesPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

/**
 * "Espacios de trabajo" (reorg item 4): SOLO gestión del workspace
 * (crear/editar/eliminar) + listado detallado de datos relacionados (read-only).
 * El dataset se asigna desde el nodo Ingesta del Lienzo; los pipelines se
 * construyen y ejecutan en el Lienzo; los modelos se gestionan en "Mis modelos".
 */
export function WorkspacesPage({ token, searchQuery, onAuthError }: WorkspacesPageProps) {
  const navigate = useNavigate()
  const setWorkspace = useAppStore((state) => state.setWorkspace)

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([])
  const [modelCount, setModelCount] = useState<number | null>(null)
  const [form, setForm] = useState<WorkspaceFormData>(emptyWorkspaceForm())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [confirm, setConfirm] = useState<
    { title: string; description: string; confirmLabel: string; onConfirm: () => Promise<void> } | null
  >(null)
  // Historial de ejecuciones por pipeline (item 4): se carga al expandir.
  const [expandedPipeline, setExpandedPipeline] = useState<number | null>(null)
  const [executions, setExecutions] = useState<Record<number, ExecutionSummary[]>>({})
  const [loadingExec, setLoadingExec] = useState(false)

  const selected = workspaces.find((w) => w.idWorkspace === selectedId) ?? null

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return q ? workspaces.filter((w) => w.name.toLowerCase().includes(q)) : workspaces
  }, [workspaces, searchQuery])

  const loadDetail = useCallback(async (wsId: number) => {
    setIsLoadingDetail(true)
    setModelCount(null)
    try {
      const [pipes, models] = await Promise.all([
        listWorkspacePipelines(token, wsId),
        listWorkspaceModels(token, wsId).catch(() => []),
      ])
      setPipelines(pipes)
      setModelCount(models.length)
    } catch (err) {
      if (!onAuthError(err)) { setPipelines([]); setModelCount(0) }
    } finally {
      setIsLoadingDetail(false)
    }
  }, [token, onAuthError])

  const loadWorkspaces = useCallback(async (preferredId?: number | null) => {
    setIsLoading(true)
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      const next = data.find((w) => w.idWorkspace === preferredId) ?? data[0] ?? null
      setSelectedId(next?.idWorkspace ?? null)
      if (next) { setWorkspace(next.name); void loadDetail(next.idWorkspace) }
    } catch (err) {
      if (!onAuthError(err)) setWorkspaces([])
    } finally {
      setIsLoading(false)
    }
  }, [token, onAuthError, setWorkspace, loadDetail])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { void loadWorkspaces() }, [token])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const selectWorkspace = (ws: WorkspaceSummary) => {
    setSelectedId(ws.idWorkspace)
    setWorkspace(ws.name)
    void loadDetail(ws.idWorkspace)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      const saved = editingId
        ? await updateWorkspace(token, editingId, form)
        : await createWorkspace(token, form)
      notify.success(editingId ? 'Proyecto actualizado.' : 'Proyecto creado.')
      setForm(emptyWorkspaceForm())
      setEditingId(null)
      setShowForm(false)
      await loadWorkspaces(saved.idWorkspace)
    } catch (err) {
      if (!onAuthError(err)) notify.error(err instanceof Error ? err.message : 'Error guardando el proyecto.')
    } finally {
      setIsSaving(false)
    }
  }

  const askDeleteWorkspace = (ws: WorkspaceSummary) =>
    setConfirm({
      title: 'Eliminar proyecto',
      description: `Se eliminará "${ws.name}" junto con sus pipelines, dataset y ejecuciones. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar proyecto',
      onConfirm: async () => {
        try {
          await deleteWorkspace(token, ws.idWorkspace)
          notify.success('Proyecto eliminado.')
          await loadWorkspaces()
        } catch (err) {
          if (!onAuthError(err)) notify.error(err instanceof Error ? err.message : 'Error eliminando el proyecto.')
        }
      },
    })

  const startEdit = (ws: WorkspaceSummary) => {
    setEditingId(ws.idWorkspace)
    setForm({ name: ws.name, description: ws.description ?? '' })
    setShowForm(true)
  }

  const openInBuilder = (ws: WorkspaceSummary) => {
    setWorkspace(ws.name)
    navigate('/builder')
  }

  const togglePipelineHistory = async (pipelineId: number) => {
    if (expandedPipeline === pipelineId) { setExpandedPipeline(null); return }
    setExpandedPipeline(pipelineId)
    if (!executions[pipelineId] && selectedId) {
      setLoadingExec(true)
      try {
        const list = await listExecutions(token, selectedId, pipelineId)
        setExecutions((prev) => ({ ...prev, [pipelineId]: list }))
      } catch (err) {
        if (!onAuthError(err)) setExecutions((prev) => ({ ...prev, [pipelineId]: [] }))
      } finally {
        setLoadingExec(false)
      }
    }
  }

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    // startedAt es un LocalDateTime naive en UTC (sin zona). Sin 'Z', el navegador
    // lo interpretaría como hora local → desfase. Lo normalizamos a UTC.
    const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
    return new Date(normalized).toLocaleString('es-PE', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-50 xl:text-3xl">
            Espacios de trabajo
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">
            Crea y administra tus proyectos. El dataset, los pipelines y su ejecución se gestionan en el Lienzo.
          </p>
        </div>
        <Button
          variant="cta"
          onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(emptyWorkspaceForm()) }}
          className="shrink-0"
        >
          <FolderPlus />
          Nuevo proyecto
        </Button>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Lista + formulario */}
        <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-lg font-semibold text-slate-50">Mis proyectos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-3">
            {showForm && (
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-4">
                <WorkspaceForm
                  form={form}
                  editingWorkspaceId={editingId}
                  isSaving={isSaving}
                  onChange={(field) => (event) =>
                    setForm((current) => ({ ...current, [field]: event.target.value }))}
                  onSubmit={handleSubmit}
                  onCancel={() => { setShowForm(false); setEditingId(null); setForm(emptyWorkspaceForm()) }}
                />
              </div>
            )}

            {isLoading ? (
              <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><Spinner size="sm" /> Cargando…</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {searchQuery.trim() ? 'Sin coincidencias.' : 'Aún no tienes proyectos.'}
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((ws) => {
                  const isSel = ws.idWorkspace === selectedId
                  return (
                    <button
                      key={ws.idWorkspace}
                      onClick={() => selectWorkspace(ws)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        isSel ? 'border-blue-500/60 bg-blue-500/10' : 'border-slate-800/80 bg-slate-950/30 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                        <Layers size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-50">{ws.name}</p>
                        <p className="truncate text-xs text-slate-400">
                          {ws.datasetPath ? 'Dataset asignado' : ws.description || 'Sin dataset'}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalle del proyecto seleccionado (read-only) */}
        <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0">
          {selected ? (
            <CardContent className="space-y-5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-slate-50">{selected.name}</h2>
                  {selected.description && (
                    <p className="mt-1 text-sm text-slate-400">{selected.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(selected)}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => askDeleteWorkspace(selected)}>
                    <Trash2 className="size-3.5" /> Eliminar
                  </Button>
                </div>
              </div>

              {/* Métricas relacionadas */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3">
                  <div className="flex items-center gap-2 text-blue-400"><Database className="size-4" /></div>
                  <p className="mt-2 text-xs text-slate-500">Dataset</p>
                  <p className="text-sm font-semibold text-slate-50">{selected.datasetPath ? 'Asignado' : '—'}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3">
                  <div className="flex items-center gap-2 text-blue-400"><Workflow className="size-4" /></div>
                  <p className="mt-2 text-xs text-slate-500">Pipelines</p>
                  <p className="text-sm font-semibold text-slate-50">
                    {isLoadingDetail ? '…' : pipelines.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3">
                  <div className="flex items-center gap-2 text-blue-400"><Boxes className="size-4" /></div>
                  <p className="mt-2 text-xs text-slate-500">Modelos</p>
                  <p className="text-sm font-semibold text-slate-50">
                    {modelCount == null ? '…' : modelCount}
                  </p>
                </div>
              </div>

              {/* Pipelines (read-only) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-200">Pipelines del proyecto</p>
                  <Button variant="ghost" size="sm" onClick={() => openInBuilder(selected)}>
                    <Network className="size-3.5" /> Abrir en el Lienzo
                  </Button>
                </div>
                {isLoadingDetail ? (
                  <p className="flex items-center gap-2 text-xs text-slate-500"><Spinner size="sm" /> Cargando…</p>
                ) : pipelines.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/20 px-4 py-4 text-center text-xs text-slate-500">
                    Sin pipelines. Crea y ejecuta el flujo desde el Lienzo.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {pipelines.map((p) => {
                      const isOpen = expandedPipeline === p.idPipeline
                      const execs = executions[p.idPipeline]
                      return (
                        <div key={p.idPipeline} className="rounded-lg border border-slate-800/80 bg-slate-950/30">
                          <button
                            onClick={() => void togglePipelineHistory(p.idPipeline)}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-900/40"
                            aria-expanded={isOpen}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="size-3.5 shrink-0 text-slate-400" />}
                              <div className="min-w-0">
                                <p className="truncate text-sm text-slate-100">{p.name}</p>
                                <p className="text-[11px] text-slate-500">{p.nodeCount} nodos · {p.executionCount} ejec.</p>
                              </div>
                            </div>
                            <Badge variant={p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'destructive' : 'secondary'}>
                              {p.status}
                            </Badge>
                          </button>

                          {isOpen && (
                            <div className="space-y-1.5 border-t border-slate-800/80 px-3 py-2">
                              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                                <History className="size-3" /> Historial de ejecuciones
                              </p>
                              {loadingExec && !execs ? (
                                <p className="flex items-center gap-2 text-xs text-slate-500"><Spinner size="sm" /> Cargando…</p>
                              ) : !execs || execs.length === 0 ? (
                                <p className="text-xs text-slate-500">Sin ejecuciones todavía.</p>
                              ) : (
                                execs.map((e) => {
                                  const m = parseMetrics(e.metrics)
                                  const acc = m.test_accuracy ?? m.val_accuracy ?? m.final_accuracy ?? m.accuracy
                                  return (
                                    <div key={e.idExecution} className="flex items-center justify-between gap-2 rounded-md bg-slate-900/50 px-2.5 py-1.5">
                                      <div className="min-w-0">
                                        <p className="text-xs text-slate-200">#{e.idExecution} · {fmtDate(e.startedAt)}</p>
                                        <p className="truncate font-mono text-[10px] text-slate-500">
                                          {e.mlflowRunId ? `run ${e.mlflowRunId.slice(0, 12)}…` : 'sin run'}
                                          {e.modelVersion ? ` · v${e.modelVersion}` : ''}
                                          {acc != null ? ` · acc ${acc.toFixed(4)}` : ''}
                                        </p>
                                      </div>
                                      <Badge variant={e.status === 'COMPLETED' ? 'success' : e.status === 'FAILED' ? 'destructive' : 'secondary'}>
                                        {e.status}
                                      </Badge>
                                    </div>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <p className="rounded-lg border border-slate-800/70 bg-slate-950/20 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                El dataset se asigna desde el <span className="text-slate-300">nodo Ingesta</span> del Lienzo. Los modelos
                entrenados se gestionan en <span className="text-slate-300">Mis modelos</span>.
              </p>
            </CardContent>
          ) : (
            <CardContent className="flex min-h-48 items-center justify-center p-5 text-sm text-slate-500">
              {isLoading ? 'Cargando…' : 'Selecciona o crea un proyecto.'}
            </CardContent>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={async () => { await confirm?.onConfirm() }}
      />
    </div>
  )
}
