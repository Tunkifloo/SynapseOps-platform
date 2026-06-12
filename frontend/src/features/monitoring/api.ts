import { authorizedRequest, fetchJson } from '@/shared/api/client'
import type { ByModelView, LifecycleMetrics } from './types'

/** Descarga un CSV (con token) y dispara la descarga en el navegador. */
const downloadCsv = async (path: string, token: string, filename: string) => {
  const res = await authorizedRequest(path, token)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── Monitoreo (alcance: usuario autenticado) ──────────────────────────────────
export const getLifecycleMetrics = (token: string) =>
  fetchJson<LifecycleMetrics>('/telemetry/lifecycle', token)

export const getByModelMetrics = (token: string) =>
  fetchJson<ByModelView>('/telemetry/by-model', token)

export const downloadLifecycleCsv = (token: string) =>
  downloadCsv('/telemetry/lifecycle.csv', token, 'lifecycle-metrics.csv')

// ── Analítica (alcance: toda la plataforma · ADMIN) ───────────────────────────
export const getGlobalLifecycleMetrics = (token: string) =>
  fetchJson<LifecycleMetrics>('/analytics/lifecycle', token)

export const getGlobalByModelMetrics = (token: string) =>
  fetchJson<ByModelView>('/analytics/by-model', token)

export const downloadGlobalLifecycleCsv = (token: string) =>
  downloadCsv('/analytics/lifecycle.csv', token, 'platform-lifecycle-metrics.csv')
