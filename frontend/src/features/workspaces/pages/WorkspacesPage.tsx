import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from 'react'
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
  Plus,
  Trash2,
  Workflow,
} from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Spinner } from '@/shared/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { PageHeader } from '@/shared/components/PageHeader'
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
import { cn } from '@/lib/utils'

interface WorkspacesPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

type Tab = 'all' | 'with' | 'without'

const formatDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—'
  // startedAt es LocalDateTime naive en UTC; sin 'Z' el navegador lo toma local.
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  return new Date(normalized).toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * "Espacios de trabajo": grid de tarjetas + tabs (Todos / Con dataset / Sin
 * dataset). Crear/editar en modal; el detalle (pipelines + historial) en un
 * drawer lateral. El dataset se asigna desde el nodo Ingesta del Lienzo.
 */
export function WorkspacesPage({ token, searchQuery, onAuthError }: WorkspacesPageProps) {
  const navigate = useNavigate()
  const setWorkspace = useAppStore((state) => state.setWorkspace)

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')

  // Modal crear/editar
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<WorkspaceFormData>(emptyWorkspaceForm())
  const [isSaving, setIsSaving] = useState(false)

  // Drawer de detalle
  const [detailId, setDetailId] = useState<number | null>(null)
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([])
  const [modelCount, setModelCount] = useState<number | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [expandedPipeline, setExpandedPipeline] = useState<number | null>(null)
  const [executions, setExecutions] = useState<Record<number, ExecutionSummary[]>>({})
  const [loadingExec, setLoadingExec] = useState(false)

  const [confirm, setConfirm] = useState<
    { title: string; description: string; confirmLabel: string; onConfirm: () => Promise<void> } | null
  >(null)

  const detail = workspaces.find((w) => w.idWorkspace === detailId) ?? null

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
    } catch (err) {
      if (!onAuthError(err)) setWorkspaces([])
    } finally {
      setIsLoading(false)
    }
  }, [token, onAuthError])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    void loadWorkspaces()
  }, [token])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const loadDetail = useCallback(
    async (wsId: number) => {
      setIsLoadingDetail(true)
      setModelCount(null)
      setExpandedPipeline(null)
      setExecutions({})
      try {
        const [pipes, models] = await Promise.all([
          listWorkspacePipelines(token, wsId),
          listWorkspaceModels(token, wsId).catch(() => []),
        ])
        setPipelines(pipes)
        setModelCount(models.length)
      } catch (err) {
        if (!onAuthError(err)) {
          setPipelines([])
          setModelCount(0)
        }
      } finally {
        setIsLoadingDetail(false)
      }
    },
    [token, onAuthError]
  )

  // ── Filtros (tabs + búsqueda) ────────────────────────────────────────────
  const counts = useMemo(() => {
    const withDs = workspaces.filter((w) => !!w.datasetPath).length
    return { all: workspaces.length, with: withDs, without: workspaces.length - withDs }
  }, [workspaces])

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return workspaces
      .filter((w) => (tab === 'with' ? !!w.datasetPath : tab === 'without' ? !w.datasetPath : true))
      .filter(
        (w) =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          (w.description ?? '').toLowerCase().includes(q)
      )
  }, [workspaces, tab, searchQuery])

  // ── Acciones ──────────────────────────────────────────────────────────────
  const openDetail = (ws: WorkspaceSummary) => {
    setDetailId(ws.idWorkspace)
    setWorkspace(ws.name)
    void loadDetail(ws.idWorkspace)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyWorkspaceForm())
    setShowForm(true)
  }

  const startEdit = (ws: WorkspaceSummary) => {
    setEditingId(ws.idWorkspace)
    setForm({ name: ws.name, description: ws.description ?? '' })
    setShowForm(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      if (editingId) await updateWorkspace(token, editingId, form)
      else await createWorkspace(token, form)
      notify.success(editingId ? 'Proyecto actualizado.' : 'Proyecto creado.')
      setShowForm(false)
      setEditingId(null)
      setForm(emptyWorkspaceForm())
      await loadWorkspaces()
    } catch (err) {
      if (!onAuthError(err)) notify.error(err instanceof Error ? err.message : 'Error guardando el proyecto.')
    } finally {
      setIsSaving(false)
    }
  }

  const askDelete = (ws: WorkspaceSummary) =>
    setConfirm({
      title: 'Eliminar proyecto',
      description: `Se eliminará "${ws.name}" junto con sus pipelines, dataset y ejecuciones. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar proyecto',
      onConfirm: async () => {
        try {
          await deleteWorkspace(token, ws.idWorkspace)
          notify.success('Proyecto eliminado.')
          if (detailId === ws.idWorkspace) setDetailId(null)
          await loadWorkspaces()
        } catch (err) {
          if (!onAuthError(err)) notify.error(err instanceof Error ? err.message : 'Error eliminando el proyecto.')
        }
      },
    })

  const openInBuilder = (ws: WorkspaceSummary) => {
    setWorkspace(ws.name)
    localStorage.setItem('synapseops:builder-ws-id', String(ws.idWorkspace))
    navigate('/builder')
  }

  const togglePipelineHistory = async (pipelineId: number) => {
    if (expandedPipeline === pipelineId) {
      setExpandedPipeline(null)
      return
    }
    setExpandedPipeline(pipelineId)
    if (!executions[pipelineId] && detailId) {
      setLoadingExec(true)
      try {
        const list = await listExecutions(token, detailId, pipelineId)
        setExecutions((prev) => ({ ...prev, [pipelineId]: list }))
      } catch (err) {
        if (!onAuthError(err)) setExecutions((prev) => ({ ...prev, [pipelineId]: [] }))
      } finally {
        setLoadingExec(false)
      }
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'with', label: 'Con dataset' },
    { key: 'without', label: 'Sin dataset' },
  ]

  return (
    <div className="space-y-5">
      {/* Encabezado + CTA */}
      <PageHeader
        title="Espacios de trabajo"
        subtitle="Crea y administra tus proyectos. El dataset, los pipelines y su ejecución se gestionan en el Lienzo."
        actions={
          <Button data-tour="create-workspace" variant="cta" size="lg" onClick={openCreate} className="shrink-0">
            <FolderPlus />
            Crear nuevo espacio
          </Button>
        }
      />

      {/* Tabs / filtros */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'true' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ease-out-quart',
              tab === t.key
                ? 'bg-primary/10 text-primary-strong'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                tab === t.key ? 'bg-primary/15 text-primary-strong' : 'bg-muted text-muted-foreground'
              )}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Grid de tarjetas */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner size="sm" /> Cargando proyectos…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((ws) => (
            <div
              key={ws.idWorkspace}
              data-tour="workspace-item"
              role="button"
              tabIndex={0}
              onClick={() => openDetail(ws)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openDetail(ws)
                }
              }}
              className="group relative flex min-w-0 cursor-pointer flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-sm outline-none transition-[transform,border-color,box-shadow] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-0"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Layers className="size-5" />
                </div>
                {/* Acciones rápidas (hover) */}
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-150 ease-out-quart group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Abrir en el Lienzo"
                    title="Abrir en el Lienzo"
                    onClick={(e) => {
                      e.stopPropagation()
                      openInBuilder(ws)
                    }}
                  >
                    <Network className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar proyecto"
                    title="Editar"
                    onClick={(e) => {
                      e.stopPropagation()
                      startEdit(ws)
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Eliminar proyecto"
                    title="Eliminar"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      askDelete(ws)
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <p className="truncate font-heading text-base font-semibold text-foreground">{ws.name}</p>
              <p className="mt-1 line-clamp-2 min-h-9 text-sm text-muted-foreground">
                {ws.description || 'Sin descripción.'}
              </p>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">{formatDate(ws.createdAt)}</span>
                <Badge variant={ws.datasetPath ? 'success' : 'secondary'}>
                  {ws.datasetPath ? 'Dataset listo' : 'Sin dataset'}
                </Badge>
              </div>
            </div>
          ))}

          {/* Tarjeta "Nuevo espacio" */}
          {!searchQuery.trim() && (
            <button
              type="button"
              onClick={openCreate}
              className="flex min-h-[168px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 p-5 text-center text-muted-foreground outline-none transition-[transform,color,background-color,border-color] duration-200 ease-out-quart hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-0"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Plus className="size-5" />
              </div>
              <span className="font-heading text-sm font-semibold text-foreground">Nuevo espacio</span>
              <span className="text-xs">Crea un proyecto en blanco.</span>
            </button>
          )}

          {/* Estado vacío total */}
          {visible.length === 0 && (searchQuery.trim() || tab !== 'all') && (
            <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
              {searchQuery.trim() ? 'Sin coincidencias para tu búsqueda.' : 'No hay proyectos en este filtro.'}
            </p>
          )}
        </div>
      )}

      {/* ── Drawer de detalle ──────────────────────────────────────────────── */}
      <Sheet open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent>
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="truncate pr-8">{detail.name}</SheetTitle>
                <SheetDescriptionSafe text={detail.description} />
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(detail)}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  <Button variant="cta" size="sm" onClick={() => openInBuilder(detail)}>
                    <Network className="size-3.5" /> Abrir en el Lienzo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => askDelete(detail)}
                  >
                    <Trash2 className="size-3.5" /> Eliminar
                  </Button>
                </div>
              </SheetHeader>

              <SheetBody className="space-y-5">
                {/* Métricas */}
                <div className="grid grid-cols-3 gap-3">
                  <MetricBox icon={Database} label="Dataset" value={detail.datasetPath ? 'Asignado' : '—'} />
                  <MetricBox
                    icon={Workflow}
                    label="Pipelines"
                    value={isLoadingDetail ? '…' : String(pipelines.length)}
                  />
                  <MetricBox
                    icon={Boxes}
                    label="Modelos"
                    value={modelCount == null ? '…' : String(modelCount)}
                  />
                </div>

                {/* Pipelines + historial */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Pipelines del proyecto</p>
                  {isLoadingDetail ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Spinner size="sm" /> Cargando…
                    </p>
                  ) : pipelines.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-4 text-center text-xs text-muted-foreground">
                      Sin pipelines. Crea y ejecuta el flujo desde el Lienzo.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {pipelines.map((p) => {
                        const isOpen = expandedPipeline === p.idPipeline
                        const execs = executions[p.idPipeline]
                        return (
                          <div key={p.idPipeline} className="rounded-lg border border-border bg-card">
                            <button
                              onClick={() => void togglePipelineHistory(p.idPipeline)}
                              className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-150 ease-out-quart hover:bg-muted/50"
                              aria-expanded={isOpen}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {isOpen ? (
                                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-foreground">{p.name}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {p.nodeCount} nodos · {p.executionCount} ejec.
                                  </p>
                                </div>
                              </div>
                              <Badge
                                variant={
                                  p.status === 'COMPLETED'
                                    ? 'success'
                                    : p.status === 'FAILED'
                                      ? 'destructive'
                                      : 'secondary'
                                }
                              >
                                {p.status}
                              </Badge>
                            </button>

                            {isOpen && (
                              <div className="space-y-1.5 border-t border-border px-3 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                                  <History className="size-3" /> Historial de ejecuciones
                                </p>
                                {loadingExec && !execs ? (
                                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Spinner size="sm" /> Cargando…
                                  </p>
                                ) : !execs || execs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Sin ejecuciones todavía.</p>
                                ) : (
                                  execs.map((e) => {
                                    const m = parseMetrics(e.metrics)
                                    const acc =
                                      m.test_accuracy ?? m.val_accuracy ?? m.final_accuracy ?? m.accuracy
                                    return (
                                      <div
                                        key={e.idExecution}
                                        className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-xs text-foreground">
                                            #{e.idExecution} · {fmtDateTime(e.startedAt)}
                                          </p>
                                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                                            {e.mlflowRunId ? `run ${e.mlflowRunId.slice(0, 12)}…` : 'sin run'}
                                            {e.modelVersion ? ` · v${e.modelVersion}` : ''}
                                            {acc != null ? ` · acc ${acc.toFixed(4)}` : ''}
                                          </p>
                                        </div>
                                        <Badge
                                          variant={
                                            e.status === 'COMPLETED'
                                              ? 'success'
                                              : e.status === 'FAILED'
                                                ? 'destructive'
                                                : 'secondary'
                                          }
                                        >
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

                <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  El dataset se asigna desde el <span className="text-foreground">nodo Ingesta</span> del Lienzo. Los
                  modelos entrenados se gestionan en <span className="text-foreground">Mis modelos</span>.
                </p>
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Modal crear/editar ─────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingId(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar proyecto' : 'Crear nuevo espacio'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Actualiza el nombre y la descripción de tu proyecto.'
                : 'Define un proyecto para organizar tus datasets, pipelines y modelos.'}
            </DialogDescription>
          </DialogHeader>
          <WorkspaceForm
            form={form}
            editingWorkspaceId={editingId}
            isSaving={isSaving}
            onChange={(field) => (event) =>
              setForm((current) => ({ ...current, [field]: event.target.value }))}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false)
              setEditingId(null)
              setForm(emptyWorkspaceForm())
            }}
          />
        </DialogContent>
      </Dialog>

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

// ── Subcomponentes ────────────────────────────────────────────────────────────
function MetricBox({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

/** Description del drawer: radix exige un nodo Description; renderiza vacío si no hay. */
function SheetDescriptionSafe({ text }: { text: string | null | undefined }) {
  return <SheetDescription className="truncate pr-8">{text || 'Sin descripción.'}</SheetDescription>
}
