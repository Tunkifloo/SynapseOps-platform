import { useCallback, useEffect, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { Check, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { Badge } from '@/shared/components/ui/badge'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { PageHeader } from '@/shared/components/PageHeader'
import { notify } from '@/shared/notify'
import {
  createPipeline,
  deletePipeline,
  listMyWorkspaces,
  listWorkspacePipelines,
  renamePipeline,
} from '@/features/workspaces/api'
import type { PipelineSummary, WorkspaceSummary } from '@/features/workspaces/types'
import { PipelineCanvas } from '@/features/pipelines/components/PipelineCanvas'

interface PipelineBuilderPageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

// Pipeline activo recordado por workspace → al volver al lienzo se conserva el mismo.
const pipeKey = (wsId: number) => `synapseops:builder-pipeline:${wsId}`

/**
 * Lienzo low-code (HU-001) vinculado a un workspace (HU-002) y a un pipeline
 * (HU-005): el proyecto + pipeline dan contexto a los nodos (ingesta, entrenamiento).
 */
export function PipelineBuilderPage({ token, onAuthError }: PipelineBuilderPageProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [activeWsId, setActiveWsId] = useState<number | null>(null)
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([])
  const [activePipelineId, setActivePipelineId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigate = useNavigate()
  const CARD_KEY = 'synapseops:builder-ws-id'
  const LAST_KEY = 'synapseops:last-builder-ws'

  const loadWorkspaces = useCallback(async () => {
    try {
      // CARD_KEY es una señal de un SOLO uso ("abrir este proyecto en el lienzo" desde
      // otro módulo). Se consume y se borra: si no, quedaría fija y pisaría siempre el
      // último workspace que el usuario seleccionó dentro del lienzo (bug de contexto).
      const raw = localStorage.getItem(CARD_KEY)
      if (raw) localStorage.removeItem(CARD_KEY)
      const preferredId = raw ? Number(raw) : undefined
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      let target = preferredId
        ? data.find((w) => w.idWorkspace === preferredId)
        : undefined
      if (!target) {
        const lastName = localStorage.getItem(LAST_KEY)
        target = lastName ? data.find((w) => w.name === lastName) : undefined
      }
      setActiveWsId((prev) => target?.idWorkspace ?? prev ?? data[0]?.idWorkspace ?? null)
    } catch (err) {
      onAuthError(err)
    } finally {
      setLoading(false)
    }
  }, [token, onAuthError])

  const loadPipelines = useCallback(
    async (wsId: number) => {
      try {
        const data = await listWorkspacePipelines(token, wsId)
        setPipelines(data)
        // Restaura el último pipeline usado en este workspace (si sigue existiendo).
        let preferred: number | null = null
        try {
          const raw = localStorage.getItem(pipeKey(wsId))
          const id = raw ? Number(raw) : NaN
          if (!Number.isNaN(id) && data.some((p) => p.idPipeline === id)) preferred = id
        } catch { /* almacenamiento no disponible */ }
        setActivePipelineId(preferred ?? data[0]?.idPipeline ?? null)
      } catch (err) {
        onAuthError(err)
      }
    },
    [token, onAuthError]
  )

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    if (activeWsId) {
      // Resetea el pipeline ANTES de cargar los del nuevo workspace: si no, el lienzo
      // pediría (workspace nuevo, pipeline viejo) por un instante → 403 (el pipeline no
      // pertenece a ese workspace). Con null, el lienzo no carga hasta tener el correcto.
      setActivePipelineId(null)
      void loadPipelines(activeWsId)
    }
  }, [activeWsId, loadPipelines])

  const activeWorkspace = workspaces.find((w) => w.idWorkspace === activeWsId) ?? null
  const activePipeline = pipelines.find((p) => p.idPipeline === activePipelineId) ?? null

  useEffect(() => {
    if (activeWorkspace?.name) {
      localStorage.setItem(LAST_KEY, activeWorkspace.name)
    }
  }, [activeWorkspace?.name, LAST_KEY])

  // Recuerda el pipeline activo por workspace para restaurarlo al volver.
  useEffect(() => {
    if (activeWsId && activePipelineId) {
      try { localStorage.setItem(pipeKey(activeWsId), String(activePipelineId)) } catch { /* noop */ }
    }
  }, [activeWsId, activePipelineId])

  const handleRenamePipeline = async () => {
    if (!activeWsId || !activePipelineId || !renameValue.trim()) { setRenaming(false); return }
    setSavingRename(true)
    try {
      await renamePipeline(token, activeWsId, activePipelineId, renameValue.trim())
      await loadPipelines(activeWsId)
      setActivePipelineId(activePipelineId)
      setRenaming(false)
      notify.success('Pipeline renombrado')
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo renombrar el pipeline.')
    } finally {
      setSavingRename(false)
    }
  }

  const handleDeletePipeline = async () => {
    if (!activeWsId || !activePipelineId) return
    try {
      await deletePipeline(token, activeWsId, activePipelineId)
      notify.success('Pipeline eliminado')
      await loadPipelines(activeWsId)
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo eliminar el pipeline.')
    }
  }

  const handleCreatePipeline = async () => {
    if (!activeWsId) return
    setCreating(true)
    try {
      const created = await createPipeline(token, activeWsId, {
        name: `Pipeline ${pipelines.length + 1}`,
      })
      await loadPipelines(activeWsId)
      setActivePipelineId(created.idPipeline)
      notify.success('Pipeline creado', { description: created.name })
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo crear el pipeline.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] min-h-[480px] flex-col gap-4">
      <PageHeader
        title="Lienzo del pipeline"
        subtitle="Arrastra nodos, conéctalos y ejecuta el entrenamiento para el proyecto activo."
        actions={!loading && workspaces.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Proyecto</span>
            <Select
              value={activeWsId ? String(activeWsId) : ''}
              onValueChange={(v) => {
                // Limpia pipeline+lista en el MISMO batch que el workspace: evita que el
                // lienzo se monte con (workspace nuevo, pipeline viejo) → 403, y que se
                // arrastre el contexto del proyecto anterior.
                setActiveWsId(Number(v))
                setActivePipelineId(null)
                setPipelines([])
              }}
            >
              <SelectTrigger className="w-48" aria-label="Proyecto">
                <SelectValue placeholder="Proyecto" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.idWorkspace} value={String(w.idWorkspace)}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline</span>
              <div className="flex items-center gap-1">
            {renaming ? (
              <div className="flex items-center gap-1">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleRenamePipeline(); if (e.key === 'Escape') setRenaming(false) }}
                  className="h-9 w-44"
                  aria-label="Nuevo nombre del pipeline"
                  autoFocus
                />
                <Button variant="ghost" size="icon-sm" loading={savingRename} onClick={() => void handleRenamePipeline()} aria-label="Guardar nombre">
                  <Check />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setRenaming(false)} aria-label="Cancelar">
                  <X />
                </Button>
              </div>
            ) : (
              <>
                <Select
                  value={activePipelineId ? String(activePipelineId) : ''}
                  onValueChange={(v) => setActivePipelineId(Number(v))}
                  disabled={pipelines.length === 0}
                >
                  <SelectTrigger className="w-44" aria-label="Pipeline">
                    <SelectValue placeholder={pipelines.length === 0 ? 'Sin pipelines' : 'Pipeline'} />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.idPipeline} value={String(p.idPipeline)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {activePipeline && (
                  <>
                    <Button
                      variant="ghost" size="icon-sm"
                      onClick={() => { setRenameValue(activePipeline.name); setRenaming(true) }}
                      aria-label="Renombrar pipeline"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost" size="icon-sm"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="Eliminar pipeline"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </>
            )}
              </div>
            </div>

            <Button variant="outline" size="sm" loading={creating} onClick={() => void handleCreatePipeline()}>
              <Plus />
              Pipeline
            </Button>

            {activeWorkspace && (
              <Badge variant={activeWorkspace.datasetPath ? 'success' : 'secondary'}>
                {activeWorkspace.datasetPath ? 'Dataset listo' : 'Sin dataset'}
              </Badge>
            )}
          </div>
        ) : null}
      />

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" /> Cargando proyectos…
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/30 text-center">
            <p className="font-heading text-base font-semibold text-foreground">
              Necesitas un proyecto para construir un pipeline
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Crea un workspace para asignar datasets y diseñar tu flujo MLOps.
            </p>
            <Button variant="cta" onClick={() => navigate('/workspaces')}>
              <FolderPlus />
              Crear proyecto
            </Button>
          </div>
        ) : activePipelineId == null ? (
          // El lienzo SIEMPRE se vincula a un pipeline. Sin uno, no se edita (evita que
          // el trabajo quede huérfano o se filtre a otro pipeline al crearlo).
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/30 text-center">
            <p className="font-heading text-base font-semibold text-foreground">
              {pipelines.length === 0 ? 'Crea un pipeline para empezar' : 'Selecciona un pipeline'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              El lienzo se vincula a un pipeline del proyecto
              {activeWorkspace?.name ? ` «${activeWorkspace.name}»` : ''}. Crea uno para diseñar y guardar tu flujo.
            </p>
            {pipelines.length === 0 && (
              <Button variant="cta" loading={creating} onClick={() => void handleCreatePipeline()}>
                <Plus />
                Crear pipeline
              </Button>
            )}
          </div>
        ) : (
          <ReactFlowProvider>
            <PipelineCanvas
              token={token}
              workspace={activeWorkspace}
              pipelineId={activePipelineId}
              onWorkspaceRefresh={() => void loadWorkspaces()}
              onAuthError={onAuthError}
            />
          </ReactFlowProvider>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar pipeline"
        description={activePipeline
          ? `Se eliminará el pipeline "${activePipeline.name}" y su topología guardada. Esta acción no se puede deshacer.`
          : ''}
        confirmLabel="Eliminar pipeline"
        onConfirm={handleDeletePipeline}
      />
    </div>
  )
}
