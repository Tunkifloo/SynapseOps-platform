import { type ComponentType, useEffect, useMemo, useState } from 'react'
import { Database, FolderPlus, Layers, Rocket, ServerCog } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Spinner } from '@/shared/components/ui/spinner'
import { listMyWorkspaces } from '@/features/workspaces/api'
import { listWorkspaceModels } from '@/features/mlflow/api'
import type { WorkspaceSummary } from '@/features/workspaces/types'
import { useAppStore } from '@/store/useAppStore'
import type { Role } from '@/types'

const MAX_RECENT = 6

const formatDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

interface StatCardProps {
  title: string
  value: string
  hint?: string
  icon: ComponentType<{ className?: string }>
}

function StatCard({ title, value, hint, icon: Icon }: StatCardProps) {
  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="flex min-w-0 items-center gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {title}
          </p>
          <div className="mt-0.5 truncate font-mono text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

interface DashboardPageProps {
  token: string
  role?: Role
  currentWorkspace: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

export function DashboardPage({ token, currentWorkspace, searchQuery, onAuthError }: DashboardPageProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modelCounts, setModelCounts] = useState<Record<number, number>>({})
  const [totalModels, setTotalModels] = useState(0)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      try {
        const data = await listMyWorkspaces(token)
        if (cancelled) return
        setWorkspaces(data)
        if ((currentWorkspace === 'Default Project' || !currentWorkspace) && data[0]) {
          setWorkspace(data[0].name)
        }
        setError(null)
      } catch (err) {
        if (cancelled || onAuthError(err)) return
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los proyectos.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentWorkspace, onAuthError, setWorkspace, token])

  // Conteo de modelos registrados por workspace (dato real de Sprint 2; el
  // estado de despliegue de contenedores es Sprint 3). Best-effort: si un
  // workspace falla, se omite sin romper el resto del dashboard.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (workspaces.length === 0) {
        if (!cancelled) { setModelCounts({}); setTotalModels(0) }
        return
      }
      const results = await Promise.allSettled(
        workspaces.map((w) => listWorkspaceModels(token, w.idWorkspace))
      )
      if (cancelled) return
      const counts: Record<number, number> = {}
      let total = 0
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          counts[workspaces[index].idWorkspace] = result.value.length
          total += result.value.length
        }
      })
      setModelCounts(counts)
      setTotalModels(total)
    })()
    return () => { cancelled = true }
  }, [token, workspaces])

  const datasetsLoaded = useMemo(
    () => workspaces.filter((w) => !!w.datasetPath).length,
    [workspaces]
  )

  const recent = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? workspaces.filter(
          (w) =>
            w.name.toLowerCase().includes(q) ||
            (w.description ?? '').toLowerCase().includes(q)
        )
      : workspaces
    return [...filtered]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, MAX_RECENT)
  }, [workspaces, searchQuery])

  const openWorkspace = (name: string) => {
    setWorkspace(name)
    navigate('/workspaces')
  }

  return (
    <div className="w-full space-y-5">
      {/* Encabezado + CTA */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground xl:text-3xl">
            Resumen
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Tus proyectos MLOps recientes y el estado general de tus modelos.
          </p>
        </div>
        <Button variant="cta" size="lg" onClick={() => navigate('/workspaces')} className="shrink-0">
          <FolderPlus />
          Crear nuevo proyecto
        </Button>
      </section>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        <StatCard
          title="Proyectos"
          value={isLoading ? '—' : String(workspaces.length)}
          icon={Layers}
        />
        <StatCard
          title="Datasets cargados"
          value={isLoading ? '—' : String(datasetsLoaded)}
          icon={Database}
        />
        <StatCard
          title="Modelos registrados"
          value={isLoading ? '—' : String(totalModels)}
          hint="Despliegue dinámico — Sprint 3"
          icon={Rocket}
        />
      </div>

      {/* Proyectos recientes */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Proyectos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner size="sm" /> Cargando proyectos…
            </div>
          )}

          {!isLoading && error && (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          )}

          {!isLoading && !error && recent.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <ServerCog className="size-6" />
              </div>
              <div>
                <p className="font-heading text-base font-semibold text-foreground">
                  {searchQuery.trim() ? 'Sin coincidencias' : 'Aún no tienes proyectos'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? 'Prueba con otro término de búsqueda.'
                    : 'Crea tu primer proyecto para empezar a construir pipelines MLOps.'}
                </p>
              </div>
              {!searchQuery.trim() && (
                <Button variant="cta" onClick={() => navigate('/workspaces')}>
                  <FolderPlus />
                  Crear primer proyecto
                </Button>
              )}
            </div>
          )}

          {!isLoading && !error && recent.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recent.map((ws) => (
                <button
                  key={ws.idWorkspace}
                  type="button"
                  onClick={() => openWorkspace(ws.name)}
                  className="group/project flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                      <Layers className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{ws.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Creado el {formatDate(ws.createdAt)}
                      </p>
                    </div>
                  </div>
                  {ws.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{ws.description}</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant={ws.datasetPath ? 'success' : 'secondary'}>
                      {ws.datasetPath ? 'Dataset listo' : 'Sin dataset'}
                    </Badge>
                    {(modelCounts[ws.idWorkspace] ?? 0) > 0 ? (
                      <Badge variant="info">
                        {modelCounts[ws.idWorkspace]} modelo{modelCounts[ws.idWorkspace] === 1 ? '' : 's'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Sin desplegar</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
