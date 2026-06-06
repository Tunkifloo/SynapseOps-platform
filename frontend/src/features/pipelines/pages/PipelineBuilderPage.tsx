import { useCallback, useEffect, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { FolderPlus, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { Badge } from '@/shared/components/ui/badge'
import { notify } from '@/shared/notify'
import {
  createPipeline,
  listMyWorkspaces,
  listWorkspacePipelines,
} from '@/features/workspaces/api'
import type { PipelineSummary, WorkspaceSummary } from '@/features/workspaces/types'
import { PipelineCanvas } from '@/features/pipelines/components/PipelineCanvas'

interface PipelineBuilderPageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

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
  const navigate = useNavigate()

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      setActiveWsId((prev) => prev ?? data[0]?.idWorkspace ?? null)
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
        setActivePipelineId(data[0]?.idPipeline ?? null)
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
    if (activeWsId) void loadPipelines(activeWsId)
  }, [activeWsId, loadPipelines])

  const activeWorkspace = workspaces.find((w) => w.idWorkspace === activeWsId) ?? null

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Lienzo del pipeline
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Arrastra nodos, conéctalos y ejecuta el entrenamiento para el proyecto activo.
          </p>
        </div>

        {!loading && workspaces.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={activeWsId ? String(activeWsId) : ''} onValueChange={(v) => setActiveWsId(Number(v))}>
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
        )}
      </div>

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
        ) : (
          <ReactFlowProvider>
            <PipelineCanvas
              token={token}
              workspace={activeWorkspace}
              pipelineId={activePipelineId}
              onWorkspaceRefresh={() => void loadWorkspaces()}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  )
}
