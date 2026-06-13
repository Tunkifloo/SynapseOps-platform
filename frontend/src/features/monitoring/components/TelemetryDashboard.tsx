import { useCallback, useEffect, useState } from 'react'
import { Activity, Boxes, Download, Gauge, Info, RefreshCw, Rocket, Timer, Users } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { PageHeader } from '@/shared/components/PageHeader'
import { DataTable, type DataColumn } from '@/shared/components/DataTable'
import { EmptyState } from '@/shared/components/EmptyState'
import { notify } from '@/shared/notify'
import { cn } from '@/lib/utils'
import type { ByModelView, LifecycleMetrics, LifecycleMetricRow } from '../types'

interface TelemetryDashboardProps {
  token: string
  onAuthError?: (error: unknown) => boolean
  title: string
  subtitle: string
  /** 'user' = Monitoreo (mis proyectos) · 'global' = Analítica (toda la plataforma, ADMIN). */
  scope: 'user' | 'global'
  loadLifecycle: (token: string) => Promise<LifecycleMetrics>
  loadByModel: (token: string) => Promise<ByModelView>
  downloadCsv: (token: string) => Promise<void>
}

const pct = (v: number | null) => (v == null ? '—' : `${v}%`)
const secs = (v: number | null) => (v == null ? '—' : v >= 60 ? `${Math.floor(v / 60)}m ${Math.round(v % 60)}s` : `${v}s`)
const ms = (v: number | null) => (v == null ? '—' : `${Math.round(v)} ms`)
const eff = (v: number | null) => (v == null ? '—' : v.toFixed(1))
const acc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const statusTone = (s: string) => (s === 'COMPLETED' ? 'text-success-strong' : s === 'FAILED' ? 'text-destructive-strong' : 'text-info-strong')

// Glosario único: cada métrica explica QUÉ es, su unidad y la DIRECCIÓN deseada.
const HELP = {
  completion: 'Porcentaje de entrenamientos que terminaron sin fallar (completados ÷ completados+fallidos). Mayor es mejor.',
  deploy: 'Porcentaje de despliegues que pasaron el health check del model-service. Mayor es mejor.',
  tRe: 'Tiempo de Re-entrenamiento (T_re): desde que inicia la ingesta hasta que termina el entrenamiento. Menor es mejor.',
  ltD: 'Lead Time de Despliegue (LT_d): desde que el modelo se aprueba/registra hasta que el model-service queda disponible. Menor es mejor.',
  cold: 'Cold start: tiempo de arranque del model-service hasta su primer /health 200. Menor es mejor.',
  effort: 'Esfuerzo de Interacción: nº de nodos que el usuario configuró en el lienzo low-code para el flujo. Menor = más automatizado.',
  accuracy: 'Mejor accuracy de validación entre las versiones del modelo. Mayor es mejor.',
} as const

type Tab = 'general' | 'by-model'

/**
 * Panel de telemetría reutilizable: pestañas "Vista general" (tasas + tabla por ejecución) y
 * "Por modelo" (tarjetas por modelo: ciclo de vida + calidad ML). Lo usan Monitoreo (scope
 * 'user') y Analítica (scope 'global', ADMIN). En global se muestra el propietario.
 */
export function TelemetryDashboard({
  token, onAuthError, title, subtitle, scope, loadLifecycle, loadByModel, downloadCsv,
}: TelemetryDashboardProps) {
  const isGlobal = scope === 'global'
  const [tab, setTab] = useState<Tab>('general')
  const [life, setLife] = useState<LifecycleMetrics | null>(null)
  const [byModel, setByModel] = useState<ByModelView | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, m] = await Promise.all([loadLifecycle(token), loadByModel(token)])
      setLife(l)
      setByModel(m)
    } catch (err) {
      if (!onAuthError?.(err)) notify.error('No se pudieron cargar los indicadores')
    } finally {
      setLoading(false)
    }
  }, [token, onAuthError, loadLifecycle, loadByModel])

  useEffect(() => { void load() }, [load])

  const onDownload = async () => {
    setDownloading(true)
    try {
      await downloadCsv(token)
      notify.success('CSV descargado')
    } catch (err) {
      if (!onAuthError?.(err)) notify.error('No se pudo descargar el CSV')
    } finally {
      setDownloading(false)
    }
  }

  const cards = [
    { label: 'Tasa de Completitud', value: pct(life?.completionRate ?? null), icon: Gauge, help: HELP.completion },
    { label: 'Despliegues Exitosos', value: pct(life?.deploySuccessRate ?? null), icon: Rocket, help: HELP.deploy },
    { label: 'Re-entrenamiento (T_re) prom.', value: secs(life?.avgRetrainSeconds ?? null), icon: Timer, help: HELP.tRe },
    { label: 'Lead Time Despliegue (LT_d) prom.', value: secs(life?.avgLeadTimeDeploySeconds ?? null), icon: Activity, help: HELP.ltD },
    { label: 'Cold start prom.', value: ms(life?.avgColdStartMs ?? null), icon: Timer, help: HELP.cold },
    { label: 'Esfuerzo de Interacción prom.', value: eff(life?.avgInteractionEffort ?? null), icon: Gauge, help: HELP.effort },
  ]

  const tabBtn = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out-quart',
        tab === key ? 'bg-primary/10 text-primary-strong' : 'text-muted-foreground hover:bg-accent/40',
      )}
      aria-pressed={tab === key}
    >
      {label}
    </button>
  )

  // Columnas de "Detalle por ejecución" (DataTable compartido).
  const execColumns: DataColumn<LifecycleMetricRow>[] = [
    { key: 'id', header: '#', render: (r) => <span className="font-mono text-muted-foreground">{r.executionId}</span> },
    ...(isGlobal
      ? [{ key: 'owner', header: 'Usuario', render: (r: LifecycleMetricRow) => <span className="text-muted-foreground">{r.ownerUsername}</span> }]
      : []),
    {
      key: 'project', header: 'Proyecto · Modelo',
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{r.workspaceName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{r.modelName ?? r.pipelineName}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Estado', render: (r) => <span className={cn('font-medium', statusTone(r.status))}>{r.status}</span> },
    { key: 'tre', header: 'T_re ⓘ', title: HELP.tRe, className: 'font-mono', render: (r) => secs(r.tRetrainSeconds) },
    { key: 'ltd', header: 'LT_d ⓘ', title: HELP.ltD, className: 'font-mono', render: (r) => secs(r.leadTimeDeploySeconds) },
    { key: 'cold', header: 'Cold start ⓘ', title: HELP.cold, className: 'font-mono', render: (r) => ms(r.coldStartMs) },
    {
      key: 'deploy', header: 'Despliegue', title: HELP.deploy,
      render: (r) => (
        <span className={r.deployStatus === 'SUCCESS' ? 'text-success-strong' : r.deployStatus === 'FAILED' ? 'text-destructive-strong' : 'text-muted-foreground'}>
          {r.deployStatus ?? '—'}
        </span>
      ),
    },
    { key: 'nodes', header: 'Nodos ⓘ', title: HELP.effort, className: 'font-mono', render: (r) => r.interactionEffort ?? '—' },
    {
      key: 'quality', header: 'Calidad',
      title: 'Señal de calidad del entrenamiento: overfitting y/o data drift detectados.',
      render: (r) => (r.dataQuality
        ? <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', r.dataQuality === 'OK' ? 'bg-success/10 text-success-strong' : 'bg-warning/15 text-warning-strong')}>{r.dataQuality}</span>
        : <span className="text-muted-foreground">—</span>),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title={title}
        subtitle={life ? `${subtitle} · ${life.sampleSize} ejecuciones` : subtitle}
        badge={
          <span className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-semibold',
            isGlobal ? 'bg-cta/15 text-cta-strong' : 'bg-primary/10 text-primary-strong',
          )}>
            {isGlobal ? 'Plataforma · ADMIN' : 'Mis proyectos'}
          </span>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} /> Actualizar
            </Button>
            <Button variant="cta" size="sm" onClick={() => void onDownload()} disabled={downloading || !life?.rows.length} loading={downloading}>
              <Download /> Descargar CSV
            </Button>
          </>
        }
      />

      {/* Banner explicativo: qué estás viendo, en lenguaje claro. */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          {isGlobal
            ? 'Telemetría del ciclo de vida de TODOS los proyectos de la plataforma (vista de administrador). '
            : 'Telemetría del ciclo de vida de tus proyectos: cuánto tarda entrenar y desplegar, y qué tan automatizado es el flujo. '}
          Pasa el cursor sobre <span className="font-medium text-foreground">cada métrica (ⓘ)</span> para ver su definición.
          Mide cada flujo: <span className="font-medium text-foreground">Ingesta → Entrenamiento → Aprobación → Despliegue</span>.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card/40 p-1">
        {tabBtn('general', 'Vista general')}
        {tabBtn('by-model', 'Por modelo')}
      </div>

      {tab === 'general' ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-card/60 p-4" title={c.help}>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <c.icon className="size-4 text-primary" /> {c.label}
                  <Info className="size-3 text-muted-foreground/60" />
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold">{c.value}</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{c.help}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Detalle por ejecución</div>
            {loading && !life ? (
              <p className="p-6 text-sm text-muted-foreground">Cargando indicadores…</p>
            ) : (
              <DataTable
                columns={execColumns}
                rows={life?.rows ?? []}
                rowKey={(r) => r.executionId}
                minWidth={760}
                empty={<EmptyState icon={Activity} title="Aún no hay ejecuciones" description="Corre un flujo en el Lienzo para empezar a medir el ciclo de vida." />}
              />
            )}
          </div>
        </>
      ) : (
        loading && !byModel ? (
          <p className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">Cargando modelos…</p>
        ) : !byModel?.models.length ? (
          <p className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
            Aún no hay modelos entrenados. Cada flujo completado registra un modelo y sus versiones aquí.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {byModel.models.map((m) => (
              <div key={`${m.modelName}-${m.workspaceName}`} className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Boxes className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.modelName}</p>
                      <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        {isGlobal && <><Users className="size-3" />{m.ownerUsername} ·{' '}</>}
                        {m.workspaceName} · {m.versions} versión(es)
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-success/10 px-2 py-0.5 font-mono text-sm font-semibold text-success-strong" title={HELP.accuracy}>
                    {acc(m.bestAccuracy)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <Stat label="Completitud" value={pct(m.completionRate)} help={HELP.completion} />
                  <Stat label="Despliegues OK" value={pct(m.deploySuccessRate)} help={HELP.deploy} />
                  <Stat label="T_re prom." value={secs(m.avgRetrainSeconds)} help={HELP.tRe} />
                  <Stat label="LT_d prom." value={secs(m.avgLeadTimeDeploySeconds)} help={HELP.ltD} />
                  <Stat label="Cold start prom." value={ms(m.avgColdStartMs)} help={HELP.cold} />
                  <Stat label="Esfuerzo prom." value={eff(m.avgInteractionEffort)} help={HELP.effort} />
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function Stat({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="flex items-center justify-between" title={help}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  )
}
