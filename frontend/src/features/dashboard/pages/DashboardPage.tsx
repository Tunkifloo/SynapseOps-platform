import { type ComponentType, useEffect, useMemo } from 'react'
import {
  Activity,
  Boxes,
  Database,
  FolderPlus,
  Layers,
  Rocket,
  ServerCog,
  Share2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Spinner } from '@/shared/components/ui/spinner'
import { ExecutionsActivityChart } from '@/features/dashboard/components/ExecutionsActivityChart'
import { useDashboardData, type DashboardExecution } from '@/features/dashboard/useDashboardData'
import type { ExecutionStatus } from '@/features/executions/types'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

const MAX_RECENT = 5

const formatDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso))
  } catch {
    return iso
  }
}

const relativeTime = (iso: string | null): string => {
  if (!iso) return 'sin iniciar'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'hace instantes'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `hace ${d} d`
  return formatDate(iso)
}

const STATUS_META: Record<
  ExecutionStatus,
  { label: string; variant: 'success' | 'destructive' | 'info' | 'secondary' }
> = {
  COMPLETED: { label: 'Completada', variant: 'success' },
  FAILED: { label: 'Fallida', variant: 'destructive' },
  RUNNING: { label: 'En curso', variant: 'info' },
  PENDING: { label: 'Pendiente', variant: 'secondary' },
}

// ── Tarjeta KPI con esquina tintada (estilo maquetado) ─────────────────────────
type Accent = 'cyan' | 'sky' | 'violet' | 'amber' | 'emerald' | 'orange'

const ACCENTS: Record<Accent, { icon: string; corner: string }> = {
  cyan: { icon: 'bg-primary/10 text-primary', corner: 'bg-primary/5' },
  sky: { icon: 'bg-sky-500/10 text-sky-600', corner: 'bg-sky-500/5' },
  violet: { icon: 'bg-violet-500/10 text-violet-600', corner: 'bg-violet-500/5' },
  amber: { icon: 'bg-amber-500/10 text-amber-600', corner: 'bg-amber-500/5' },
  emerald: { icon: 'bg-success/10 text-success', corner: 'bg-success/5' },
  orange: { icon: 'bg-cta/10 text-cta', corner: 'bg-cta/5' },
}

interface StatCardProps {
  title: string
  value: number | null
  hint?: string
  icon: ComponentType<{ className?: string }>
  accent: Accent
  loading: boolean
}

function StatCard({ title, value, hint, icon: Icon, accent, loading }: StatCardProps) {
  const a = ACCENTS[accent]
  return (
    <Card className="relative min-w-0 overflow-hidden">
      <div
        aria-hidden="true"
        className={cn('pointer-events-none absolute -top-6 -right-6 size-24 rounded-bl-[3rem]', a.corner)}
      />
      <CardContent className="relative">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {title}
          </p>
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', a.icon)}>
            <Icon className="size-5" />
          </div>
        </div>
        <div className="font-heading text-3xl font-bold tracking-tight text-foreground">
          {loading || value === null ? (
            <span className="text-muted-foreground/40">—</span>
          ) : (
            value.toLocaleString('es')
          )}
        </div>
        {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
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
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const navigate = useNavigate()
  const data = useDashboardData(token, onAuthError)

  // Selecciona el primer workspace como activo si aún no hay uno elegido.
  useEffect(() => {
    if ((currentWorkspace === 'Default Project' || !currentWorkspace) && data.workspaces[0]) {
      setWorkspace(data.workspaces[0].name)
    }
  }, [currentWorkspace, data.workspaces, setWorkspace])

  const runningNow = useMemo(
    () => data.executions.filter((e) => e.status === 'RUNNING' || e.status === 'PENDING').length,
    [data.executions]
  )

  const recentProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? data.workspaces.filter(
          (w) => w.name.toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q)
        )
      : data.workspaces
    return [...filtered]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, MAX_RECENT)
  }, [data.workspaces, searchQuery])

  const recentExecutions = useMemo(
    () =>
      [...data.executions]
        .sort((a, b) => +new Date(b.startedAt ?? 0) - +new Date(a.startedAt ?? 0))
        .slice(0, MAX_RECENT),
    [data.executions]
  )

  const openWorkspace = (name: string) => {
    setWorkspace(name)
    navigate('/workspaces')
  }

  const hasExecutions = data.executions.length > 0

  return (
    <div className="w-full space-y-5">
      {/* Encabezado + CTA */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground xl:text-3xl">
            Resumen
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Tus proyectos MLOps y el estado general de tus modelos y ejecuciones.
          </p>
        </div>
        <Button variant="cta" size="lg" onClick={() => navigate('/workspaces')} className="shrink-0">
          <FolderPlus />
          Crear nuevo proyecto
        </Button>
      </section>

      {data.error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {data.error}
        </p>
      )}

      {/* Bento de KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <StatCard
          title="Proyectos"
          value={data.workspaces.length}
          hint={`${data.datasetsLoaded} con dataset listo`}
          icon={Layers}
          accent="cyan"
          loading={data.loadingCore}
        />
        <StatCard
          title="Datasets cargados"
          value={data.datasetsLoaded}
          hint={`de ${data.workspaces.length} proyecto${data.workspaces.length === 1 ? '' : 's'}`}
          icon={Database}
          accent="sky"
          loading={data.loadingCore}
        />
        <StatCard
          title="Pipelines"
          value={data.pipelineCount}
          hint="en todos tus espacios"
          icon={Share2}
          accent="violet"
          loading={data.loadingMetrics}
        />
        <StatCard
          title="Ejecuciones"
          value={data.executionTotal}
          hint={data.loadingActivity ? 'calculando…' : `${runningNow} en curso`}
          icon={Activity}
          accent="amber"
          loading={data.loadingMetrics}
        />
        <StatCard
          title="Modelos registrados"
          value={data.modelsRegistered}
          hint="en el Model Registry"
          icon={Boxes}
          accent="emerald"
          loading={data.loadingMetrics}
        />
        <StatCard
          title="Modelos en producción"
          value={data.modelsInProduction}
          hint={
            data.modelsRegistered != null
              ? `de ${data.modelsRegistered} registrado${data.modelsRegistered === 1 ? '' : 's'}`
              : undefined
          }
          icon={Rocket}
          accent="orange"
          loading={data.loadingProduction}
        />
      </div>

      {/* Gráfico de actividad */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Actividad de ejecuciones · últimos 7 días</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {data.loadingActivity ? (
            <div className="flex h-[260px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Cargando actividad…
            </div>
          ) : hasExecutions ? (
            <ExecutionsActivityChart executions={data.executions} />
          ) : (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Activity className="size-7 text-muted-foreground/50" />
              Aún no hay ejecuciones que mostrar.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feeds: proyectos + ejecuciones recientes */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Proyectos recientes */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Proyectos recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.loadingCore && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner size="sm" /> Cargando proyectos…
              </div>
            )}

            {!data.loadingCore && recentProjects.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
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

            {!data.loadingCore && recentProjects.length > 0 && (
              <ul className="divide-y divide-border">
                {recentProjects.map((ws) => (
                  <li key={ws.idWorkspace}>
                    <button
                      type="button"
                      onClick={() => openWorkspace(ws.name)}
                      className="group/project flex w-full min-w-0 cursor-pointer items-center gap-3 py-3 text-left transition-colors outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                        <Layers className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{ws.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Creado el {formatDate(ws.createdAt)}
                        </p>
                      </div>
                      <Badge variant={ws.datasetPath ? 'success' : 'secondary'} className="shrink-0">
                        {ws.datasetPath ? 'Dataset listo' : 'Sin dataset'}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Ejecuciones recientes */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Ejecuciones recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.loadingActivity && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner size="sm" /> Cargando ejecuciones…
              </div>
            )}

            {!data.loadingActivity && recentExecutions.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/15">
                  <Activity className="size-6" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Aún no has ejecutado ningún pipeline.
                </p>
              </div>
            )}

            {!data.loadingActivity && recentExecutions.length > 0 && (
              <ul className="divide-y divide-border">
                {recentExecutions.map((exec: DashboardExecution) => {
                  const meta = STATUS_META[exec.status]
                  return (
                    <li
                      key={`${exec.workspaceId}-${exec.pipelineId}-${exec.idExecution}`}
                      className="flex min-w-0 items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {exec.pipelineName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {exec.workspaceName} · {relativeTime(exec.startedAt)}
                        </p>
                      </div>
                      <Badge variant={meta.variant} className="shrink-0">
                        {meta.label}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
