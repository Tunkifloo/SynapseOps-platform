import { useMemo } from 'react'

import type { DashboardExecution } from '@/features/dashboard/useDashboardData'
import { cn } from '@/lib/utils'

/**
 * Gráfico de barras apiladas hecho a mano (sin dependencias): ejecuciones de los
 * últimos 7 días por estado. Se evita una librería de charts para no romper el
 * pre-bundle de Vite y mantener el bundle ligero (RN-008, offline-capable).
 */
const SERIES = [
  { key: 'completed', label: 'Completadas', color: 'var(--success)' },
  { key: 'running', label: 'En curso', color: 'var(--info)' },
  { key: 'failed', label: 'Fallidas', color: 'var(--destructive)' },
] as const

interface DayBucket {
  label: string
  completed: number
  running: number
  failed: number
  total: number
}

const TRACK_HEIGHT = 200 // px

function buildSevenDays(executions: DashboardExecution[]): DayBucket[] {
  const buckets = new Map<string, DayBucket>()
  const order: string[] = []
  const now = new Date()

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(now.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = new Intl.DateTimeFormat('es', { weekday: 'short' }).format(d)
    order.push(key)
    buckets.set(key, { label, completed: 0, running: 0, failed: 0, total: 0 })
  }

  for (const e of executions) {
    if (!e.startedAt) continue
    const key = new Date(e.startedAt).toISOString().slice(0, 10)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (e.status === 'COMPLETED') bucket.completed += 1
    else if (e.status === 'FAILED') bucket.failed += 1
    else bucket.running += 1
    bucket.total += 1
  }

  return order.map((k) => buckets.get(k)!)
}

interface ExecutionsActivityChartProps {
  executions: DashboardExecution[]
}

export function ExecutionsActivityChart({ executions }: ExecutionsActivityChartProps) {
  const days = useMemo(() => buildSevenDays(executions), [executions])
  const max = useMemo(() => Math.max(1, ...days.map((d) => d.total)), [days])

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-2" style={{ height: TRACK_HEIGHT + 28 }}>
        {/* Eje Y (referencia mínima) */}
        <div className="flex w-6 shrink-0 flex-col justify-between pb-7 text-right text-[10px] text-muted-foreground">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>

        {/* Columnas */}
        <div className="flex flex-1 items-end justify-between gap-1.5 sm:gap-3">
          {days.map((d, i) => (
            <div
              key={i}
              className="group relative flex flex-1 flex-col items-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:ease-out-quart motion-safe:[animation-duration:280ms]"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block">
                <p className="mb-1 font-semibold capitalize">{d.label}</p>
                {SERIES.map((s) => (
                  <p key={s.key} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {s.label}: <span className="font-mono font-semibold">{d[s.key]}</span>
                  </p>
                ))}
              </div>

              {/* Barra apilada */}
              <div
                className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-md bg-muted/60 transition-colors duration-150 ease-out-quart group-hover:bg-muted"
                style={{ height: TRACK_HEIGHT }}
                aria-label={`${d.label}: ${d.completed} completadas, ${d.running} en curso, ${d.failed} fallidas`}
              >
                {SERIES.map((s) => {
                  const value = d[s.key]
                  if (value === 0) return null
                  return (
                    <div
                      key={s.key}
                      style={{ height: `${(value / max) * TRACK_HEIGHT}px`, background: s.color }}
                      className="w-full first:rounded-t-md"
                    />
                  )
                })}
              </div>

              {/* Etiqueta del día */}
              <span className="mt-2 text-[11px] font-medium text-muted-foreground capitalize">
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        {SERIES.map((s) => (
          <span key={s.key} className={cn('flex items-center gap-1.5 text-xs text-muted-foreground')}>
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
