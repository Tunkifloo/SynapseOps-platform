import { type ComponentType, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Boxes,
  CheckCircle2,
  Database,
  FolderPlus,
  Gauge,
  Layers,
  Network,
  Rocket,
  Share2,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Spinner } from '@/shared/components/ui/spinner'
import { PageHeader } from '@/shared/components/PageHeader'
import { KpiCard } from '@/shared/components/KpiCard'
import { EmptyState } from '@/shared/components/EmptyState'
import { ExecutionsActivityChart } from '@/features/dashboard/components/ExecutionsActivityChart'
import { useDashboardData, type DashboardExecution } from '@/features/dashboard/useDashboardData'
import { getLifecycleMetrics } from '@/features/monitoring/api'
import type { LifecycleMetrics } from '@/features/monitoring/types'
import { listDeployments } from '@/features/deployments/api'
import type { DeploymentsView } from '@/features/deployments/types'
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

const secs = (s: number | null) =>
  s == null ? '—' : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`

const STATUS_META: Record<
  ExecutionStatus,
  { label: string; variant: 'success' | 'destructive' | 'info' | 'secondary' }
> = {
  COMPLETED: { label: 'Completada', variant: 'success' },
  FAILED: { label: 'Fallida', variant: 'destructive' },
  RUNNING: { label: 'En curso', variant: 'info' },
  PENDING: { label: 'Pendiente', variant: 'secondary' },
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

  // Salud/eficiencia (telemetría de ciclo de vida + despliegues activos). Best-effort.
  const [lifecycle, setLifecycle] = useState<LifecycleMetrics | null>(null)
  const [deployView, setDeployView] = useState<DeploymentsView | null>(null)
  useEffect(() => {
    let active = true
    getLifecycleMetrics(token).then((l) => { if (active) setLifecycle(l) }).catch(() => {})
    listDeployments(token).then((d) => { if (active) setDeployView(d) }).catch(() => {})
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if ((currentWorkspace === 'Default Project' || !currentWorkspace) && data.workspaces[0]) {
      setWorkspace(data.workspaces[0].name)
    }
  }, [currentWorkspace, data.workspaces, setWorkspace])

  const runningNow = useMemo(
    () => data.executions.filter((e) => e.status === 'RUNNING' || e.status === 'PENDING').length,
    [data.executions],
  )
  const completedCount = useMemo(
    () => data.executions.filter((e) => e.status === 'COMPLETED').length,
    [data.executions],
  )
  const qualityAlerts = useMemo(
    () => (lifecycle?.rows ?? []).filter((r) => r.dataQuality && r.dataQuality !== 'OK').length,
    [lifecycle],
  )

  const recentProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? data.workspaces.filter(
          (w) => w.name.toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q),
        )
      : data.workspaces
    return [...filtered].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, MAX_RECENT)
  }, [data.workspaces, searchQuery])

  const recentExecutions = useMemo(
    () =>
      [...data.executions]
        .sort((a, b) => +new Date(b.startedAt ?? 0) - +new Date(a.startedAt ?? 0))
        .slice(0, MAX_RECENT),
    [data.executions],
  )

  const openWorkspace = (name: string) => { setWorkspace(name); navigate('/workspaces') }
  const hasExecutions = data.executions.length > 0
  const activeDeploys = deployView?.active ?? 0

  // ── Onboarding "Primeros pasos" ──────────────────────────────────────────────
  const steps = [
    { label: 'Crea un proyecto', done: data.workspaces.length > 0, to: '/workspaces' },
    { label: 'Asigna un dataset', done: data.datasetsLoaded > 0, to: '/datasets' },
    { label: 'Entrena un modelo', done: completedCount > 0, to: '/builder' },
    { label: 'Despliega', done: activeDeploys > 0 || (data.modelsInProduction ?? 0) > 0, to: '/deployments' },
  ]
  const doneSteps = steps.filter((s) => s.done).length
  const showOnboarding = doneSteps < steps.length && !data.loadingCore

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Resumen"
        subtitle="Tus proyectos MLOps y el estado general de tus modelos y ejecuciones."
        actions={
          <Button variant="cta" size="lg" onClick={() => navigate('/workspaces')}>
            <FolderPlus />
            Crear nuevo proyecto
          </Button>
        }
      />

      {data.error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {data.error}
        </p>
      )}

      {/* Onboarding: pasos para poner en marcha un flujo MLOps */}
      {showOnboarding && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-sm font-semibold text-foreground">Primeros pasos</p>
              <Badge variant="secondary">{doneSteps} / {steps.length}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => navigate(s.to)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none',
                    s.done
                      ? 'border-success/30 bg-success/5'
                      : 'cursor-pointer border-border hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-primary/30',
                  )}
                >
                  <span className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    s.done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
                  )}>
                    {s.done ? <CheckCircle2 className="size-4" /> : i + 1}
                  </span>
                  <span className={cn('text-sm font-medium', s.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accesos rápidos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction icon={Network} label="Lienzo" hint="Construye y entrena" onClick={() => navigate('/builder')} />
        <QuickAction icon={Rocket} label="Despliegues" hint="Sirve inferencias" onClick={() => navigate('/deployments')} />
        <QuickAction icon={Activity} label="Monitoreo" hint="Telemetría y calidad" onClick={() => navigate('/monitoring')} />
        <QuickAction icon={Database} label="Datasets" hint="Gestiona tus datos" onClick={() => navigate('/datasets')} />
      </div>

      {/* KPIs de inventario */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard title="Proyectos" value={data.workspaces.length.toLocaleString('es')} hint={`${data.datasetsLoaded} con dataset`} icon={Layers} accent="cyan" loading={data.loadingCore} onClick={() => navigate('/workspaces')} />
        <KpiCard title="Pipelines" value={data.pipelineCount?.toLocaleString('es')} hint="en todos tus espacios" icon={Share2} accent="violet" loading={data.loadingMetrics} onClick={() => navigate('/builder')} />
        <KpiCard title="Modelos registrados" value={data.modelsRegistered?.toLocaleString('es')} hint="en el Model Registry" icon={Boxes} accent="sky" loading={data.loadingMetrics} onClick={() => navigate('/models')} />
        <KpiCard title="Modelos en producción" value={data.modelsInProduction?.toLocaleString('es')} hint={activeDeploys > 0 ? `${activeDeploys} desplegado${activeDeploys === 1 ? '' : 's'}` : 'ninguno activo'} icon={Rocket} accent="orange" loading={data.loadingProduction} onClick={() => navigate('/deployments')} />
      </div>

      {/* KPIs de salud / eficiencia */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          title="Tasa de éxito"
          value={lifecycle?.completionRate != null ? `${lifecycle.completionRate}%` : '—'}
          hint="entrenamientos completados"
          icon={ShieldCheck} accent="emerald" loading={!lifecycle} onClick={() => navigate('/monitoring')}
        />
        <KpiCard
          title="Re-entrenamiento prom."
          value={secs(lifecycle?.avgRetrainSeconds ?? null)}
          hint="tiempo de entrenamiento (T_re)"
          icon={Timer} accent="amber" loading={!lifecycle} onClick={() => navigate('/monitoring')}
        />
        <KpiCard
          title="Despliegues activos"
          value={deployView ? `${deployView.active} / ${deployView.max}` : '—'}
          hint="model-services en uso"
          icon={Rocket} accent="orange" loading={!deployView} onClick={() => navigate('/deployments')}
        />
        <KpiCard
          title="Calidad de datos"
          value={lifecycle ? (qualityAlerts === 0 ? 'OK' : String(qualityAlerts)) : '—'}
          hint={qualityAlerts === 0 ? 'sin drift/overfitting' : 'ejecuciones con alerta'}
          icon={Gauge} accent={qualityAlerts === 0 ? 'emerald' : 'amber'} loading={!lifecycle} onClick={() => navigate('/monitoring')}
        />
      </div>

      {/* Actividad + estado operativo */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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
              <EmptyState icon={Activity} title="Aún no hay ejecuciones" description="Entrena un pipeline para ver tu actividad aquí." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Estado operativo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <OpRow label="Ejecuciones en curso" value={`${runningNow}`} tone={runningNow > 0 ? 'info' : 'muted'} />
            <OpRow label="Despliegues activos" value={deployView ? `${deployView.active} / ${deployView.max}` : '—'} tone={activeDeploys > 0 ? 'success' : 'muted'} />
            <OpRow label="Total ejecuciones" value={data.executions.length.toLocaleString('es')} tone="muted" />
            <div className="border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Última ejecución</p>
              {recentExecutions[0] ? (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-foreground">{recentExecutions[0].pipelineName}</span>
                  <Badge variant={STATUS_META[recentExecutions[0].status].variant} className="shrink-0">
                    {STATUS_META[recentExecutions[0].status].label}
                  </Badge>
                </div>
              ) : (
                <p className="mt-1.5 text-muted-foreground">Sin ejecuciones todavía.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feeds: proyectos + ejecuciones recientes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b"><CardTitle>Proyectos recientes</CardTitle></CardHeader>
          <CardContent>
            {data.loadingCore && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Spinner size="sm" /> Cargando proyectos…</div>
            )}
            {!data.loadingCore && recentProjects.length === 0 && (
              <EmptyState
                icon={Layers}
                title={searchQuery.trim() ? 'Sin coincidencias' : 'Aún no tienes proyectos'}
                description={searchQuery.trim() ? 'Prueba con otro término de búsqueda.' : 'Crea tu primer proyecto para empezar a construir pipelines MLOps.'}
                action={!searchQuery.trim() && (
                  <Button variant="cta" onClick={() => navigate('/workspaces')}><FolderPlus /> Crear primer proyecto</Button>
                )}
              />
            )}
            {!data.loadingCore && recentProjects.length > 0 && (
              <ul className="divide-y divide-border">
                {recentProjects.map((ws) => (
                  <li key={ws.idWorkspace}>
                    <button
                      type="button"
                      onClick={() => openWorkspace(ws.name)}
                      className="flex w-full min-w-0 cursor-pointer items-center gap-3 py-3 text-left transition-colors outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                        <Layers className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{ws.name}</p>
                        <p className="truncate text-xs text-muted-foreground">Creado el {formatDate(ws.createdAt)}</p>
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

        <Card>
          <CardHeader className="border-b"><CardTitle>Ejecuciones recientes</CardTitle></CardHeader>
          <CardContent>
            {data.loadingActivity && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Spinner size="sm" /> Cargando ejecuciones…</div>
            )}
            {!data.loadingActivity && recentExecutions.length === 0 && (
              <EmptyState icon={Activity} title="Sin ejecuciones" description="Aún no has ejecutado ningún pipeline." />
            )}
            {!data.loadingActivity && recentExecutions.length > 0 && (
              <ul className="divide-y divide-border">
                {recentExecutions.map((exec: DashboardExecution) => {
                  const meta = STATUS_META[exec.status]
                  return (
                    <li key={`${exec.workspaceId}-${exec.pipelineId}-${exec.idExecution}`} className="flex min-w-0 items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{exec.pipelineName}</p>
                        <p className="truncate text-xs text-muted-foreground">{exec.workspaceName} · {relativeTime(exec.startedAt)}</p>
                      </div>
                      <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
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

// ── Acceso rápido ──────────────────────────────────────────────────────────────
function QuickAction({ icon: Icon, label, hint, onClick }: {
  icon: ComponentType<{ className?: string }>; label: string; hint: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors group-hover:bg-primary/15">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </button>
  )
}

function OpRow({ label, value, tone }: { label: string; value: string; tone: 'info' | 'success' | 'muted' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        'font-mono font-semibold',
        tone === 'info' ? 'text-info' : tone === 'success' ? 'text-success' : 'text-foreground',
      )}>
        {value}
      </span>
    </div>
  )
}
