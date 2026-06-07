import { useCallback, useEffect, useState } from 'react'
import { Boxes } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { listMyWorkspaces } from '@/features/workspaces/api'
import type { WorkspaceSummary } from '@/features/workspaces/types'
import { WorkspaceModelsPanel } from '@/features/mlflow/components/WorkspaceModelsPanel'

interface MyModelsPageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

/**
 * Módulo "Mis modelos" (reorg item 4): gestión de los artefactos versionados
 * del usuario por workspace (CRUD vía WorkspaceModelsPanel, RBAC DN-3) +
 * visualización de datos relacionados. Separado de "Espacios de trabajo".
 */
export function MyModelsPage({ token, onAuthError }: MyModelsPageProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [activeWsId, setActiveWsId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      setActiveWsId((prev) => prev ?? data[0]?.idWorkspace ?? null)
    } catch (err) {
      if (!onAuthError(err)) setWorkspaces([])
    } finally {
      setLoading(false)
    }
  }, [token, onAuthError])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { void loadWorkspaces() }, [token])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-50 xl:text-3xl">
            Mis modelos
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">
            Artefactos versionados registrados en MLflow. Gestiona versiones, stage y despliegue por proyecto.
          </p>
        </div>

        {!loading && workspaces.length > 0 && (
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-blue-400" />
            <Select value={activeWsId ? String(activeWsId) : ''} onValueChange={(v) => setActiveWsId(Number(v))}>
              <SelectTrigger className="w-56" aria-label="Proyecto">
                <SelectValue placeholder="Proyecto" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.idWorkspace} value={String(w.idWorkspace)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
          <Spinner size="sm" /> Cargando proyectos…
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/20 px-6 py-8 text-center">
          <Boxes className="mb-3 size-9 text-slate-600" />
          <p className="text-base font-semibold text-slate-50">Sin proyectos todavía</p>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Crea un espacio de trabajo y entrena un pipeline para registrar tus primeros modelos.
          </p>
        </div>
      ) : activeWsId != null ? (
        <WorkspaceModelsPanel token={token} workspaceId={activeWsId} onAuthError={onAuthError} />
      ) : null}
    </div>
  )
}
