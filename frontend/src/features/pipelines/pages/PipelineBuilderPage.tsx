import { useCallback, useEffect, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { FolderPlus } from 'lucide-react'
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
import { listMyWorkspaces } from '@/features/workspaces/api'
import type { WorkspaceSummary } from '@/features/workspaces/types'
import { PipelineCanvas } from '@/features/pipelines/components/PipelineCanvas'

interface PipelineBuilderPageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

/**
 * Página del lienzo low-code (HU-001) vinculada a un workspace (HU-002):
 * el proyecto seleccionado da contexto a los nodos (p. ej. ingesta de dataset).
 */
export function PipelineBuilderPage({ token, onAuthError }: PipelineBuilderPageProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      setActiveId((prev) => prev ?? data[0]?.idWorkspace ?? null)
    } catch (err) {
      if (!onAuthError(err)) {
        // El error de red/servidor ya lo notifica el cliente HTTP (HU-020).
      }
    } finally {
      setLoading(false)
    }
  }, [token, onAuthError])

  useEffect(() => {
    void load()
  }, [load])

  const activeWorkspace = workspaces.find((w) => w.idWorkspace === activeId) ?? null

  return (
    <div className="flex h-[calc(100svh-8rem)] min-h-[480px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Lienzo del pipeline
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Arrastra nodos, conéctalos de izquierda a derecha y configúralos para el proyecto activo.
          </p>
        </div>

        {!loading && workspaces.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Proyecto:</span>
            <Select
              value={activeId ? String(activeId) : ''}
              onValueChange={(v) => setActiveId(Number(v))}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Selecciona un proyecto" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.idWorkspace} value={String(w.idWorkspace)}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              onWorkspaceRefresh={() => void load()}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  )
}
