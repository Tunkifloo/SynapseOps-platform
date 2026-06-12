import {
  downloadGlobalLifecycleCsv,
  getGlobalByModelMetrics,
  getGlobalLifecycleMetrics,
} from '@/features/monitoring/api'
import { TelemetryDashboard } from '@/features/monitoring/components/TelemetryDashboard'

interface AnalyticsPageProps {
  token: string
  onAuthError?: (error: unknown) => boolean
}

/**
 * Módulo "Analítica" (ADMIN): telemetría GLOBAL de toda la plataforma (todos los usuarios)
 * para el estudio OE4 sobre la muestra de 30-31 proyectos. Reutiliza el panel de Monitoreo
 * con los endpoints globales (/api/v1/analytics/*). Restringido a ADMIN.
 */
export function AnalyticsPage({ token, onAuthError }: AnalyticsPageProps) {
  return (
    <TelemetryDashboard
      token={token}
      onAuthError={onAuthError}
      title="Analítica de plataforma"
      subtitle="Telemetría global de todos los proyectos y usuarios de la plataforma"
      scope="global"
      loadLifecycle={getGlobalLifecycleMetrics}
      loadByModel={getGlobalByModelMetrics}
      downloadCsv={downloadGlobalLifecycleCsv}
    />
  )
}
