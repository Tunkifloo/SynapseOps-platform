import { useCallback, useEffect, useState } from 'react'
import { Activity, Boxes, Download, Gauge, RefreshCw, Rocket, Timer } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { notify } from '@/shared/notify'
import { cn } from '@/lib/utils'
import type { ByModelView, LifecycleMetrics } from '../types'

interface TelemetryDashboardProps {
  token: string
  onAuthError?: (error: unknown) => boolean
  title: string
  subtitle: string
  /** Carga de indicadores de ciclo de vida (alcance usuario o global). */
  loadLifecycle: (token: string) => Promise<LifecycleMetrics>
  /** Carga de indicadores agrupados por modelo. */
  loadByModel: (token: string) => Promise<ByModelView>
  /** Descarga del CSV (alcance correspondiente). */
  downloadCsv: (token: string) => Promise<void>
}

const pct = (v: number | null) => (v == null ? '—' : `${v}%`)
const secs = (v: number | null) => (v == null ? '—' : v >= 60 ? `${Math.floor(v / 60)}m ${Math.round(v % 60)}s` : `${v}s`)
const ms = (v: number | null) => (v == null ? '—' : `${Math.round(v)} ms`)
const eff = (v: number | null) => (v == null ? '—' : v.toFixed(1))
const acc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const statusTone = (s: string) => (s === 'COMPLETED' ? 'text-success' : s === 'FAILED' ? 'text-destructive' : 'text-info')

type Tab = 'general' | 'by-model'

/**
 * Panel de telemetría reutilizable con dos pestañas: "Vista general" (tasas + tabla por
 * ejecución) y "Por modelo" (tarjetas por modelo: ciclo de vida + calidad ML). Lo usan
 * Monitoreo (alcance usuario) y Analítica (alcance global, ADMIN) cambiando los loaders.
 */
export function TelemetryDashboard({
  token, onAuthError, title, subtitle, loadLifecycle, loadByModel, downloadCsv,
}: TelemetryDashboardProps) {
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
    { label: 'Tasa de Completitud', value: pct(life?.completionRate ?? null), icon: Gauge, hint: 'Entrenamientos finalizados sin interrupción' },
    { label: 'Despliegues Exitosos', value: pct(life?.deploySuccessRate ?? null), icon: Rocket, hint: 'model-services que pasaron el health check' },
    { label: 'Re-entrenamiento (T_re) prom.', value: secs(life?.avgRetrainSeconds ?? null), icon: Timer, hint: 'Ingesta → fin de entrenamiento' },
    { label: 'Lead Time Despliegue (LT_d) prom.', value: secs(life?.avgLeadTimeDeploySeconds ?? null), icon: Activity, hint: 'Aprobación → model-service disponible' },
    { label: 'Cold start prom.', value: ms(life?.avgColdStartMs ?? null), icon: Timer, hint: 'Arranque del model-service hasta /health 200' },
    { label: 'Esfuerzo de Interacción prom.', value: eff(life?.avgInteractionEffort ?? null), icon: Gauge, hint: 'Nodos del lienzo por flujo' },
  ]

  const tabBtn = (key: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        tab === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/40',
      )}
      aria-pressed={tab === key}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {subtitle}
            {life ? <span className="font-medium text-foreground"> · muestra n={life.sampleSize}</span> : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn(loading && 'animate-spin')} /> Actualizar
          </Button>
          <Button variant="cta" size="sm" onClick={() => void onDownload()} disabled={downloading || !life?.rows.length} loading={downloading}>
            <Download /> Descargar CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card/40 p-1">
        {tabBtn('general', 'Vista general')}
        {tabBtn('by-model', 'Por modelo')}
      </div>

      {tab === 'general' ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <c.icon className="size-4 text-primary" /> {c.label}
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold">{c.value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{c.hint}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Detalle por ejecución</div>
            {loading && !life ? (
              <p className="p-6 text-sm text-muted-foreground">Cargando indicadores…</p>
            ) : !life?.rows.length ? (
              <p className="p-6 text-sm text-muted-foreground">
                Aún no hay ejecuciones. Corre un flujo en el Lienzo para empezar a medir el ciclo de vida.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Proyecto · Modelo</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                      <th className="px-4 py-2 font-medium">T_re</th>
                      <th className="px-4 py-2 font-medium">LT_d</th>
                      <th className="px-4 py-2 font-medium">Cold start</th>
                      <th className="px-4 py-2 font-medium">Despliegue</th>
                      <th className="px-4 py-2 font-medium">Nodos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {life.rows.map((r) => (
                      <tr key={r.executionId} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2 font-mono text-muted-foreground">{r.executionId}</td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{r.workspaceName}</div>
                          <div className="text-[11px] text-muted-foreground">{r.modelName ?? r.pipelineName}</div>
                        </td>
                        <td className={cn('px-4 py-2 font-medium', statusTone(r.status))}>{r.status}</td>
                        <td className="px-4 py-2 font-mono">{secs(r.tRetrainSeconds)}</td>
                        <td className="px-4 py-2 font-mono">{secs(r.leadTimeDeploySeconds)}</td>
                        <td className="px-4 py-2 font-mono">{ms(r.coldStartMs)}</td>
                        <td className={cn('px-4 py-2', r.deployStatus === 'SUCCESS' ? 'text-success' : r.deployStatus === 'FAILED' ? 'text-destructive' : 'text-muted-foreground')}>
                          {r.deployStatus ?? '—'}
                        </td>
                        <td className="px-4 py-2 font-mono">{r.interactionEffort ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        // ── Pestaña "Por modelo" ──────────────────────────────────────────────
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
                  <div className="flex items-center gap-2 min-w-0">
                    <Boxes className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.modelName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.workspaceName} · {m.versions} versión(es)</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-success/10 px-2 py-0.5 font-mono text-sm font-semibold text-success">{acc(m.bestAccuracy)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <Stat label="Completitud" value={pct(m.completionRate)} />
                  <Stat label="Despliegues OK" value={pct(m.deploySuccessRate)} />
                  <Stat label="T_re prom." value={secs(m.avgRetrainSeconds)} />
                  <Stat label="LT_d prom." value={secs(m.avgLeadTimeDeploySeconds)} />
                  <Stat label="Cold start prom." value={ms(m.avgColdStartMs)} />
                  <Stat label="Esfuerzo prom." value={eff(m.avgInteractionEffort)} />
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  )
}
