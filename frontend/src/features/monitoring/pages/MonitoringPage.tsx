import { downloadLifecycleCsv, getByModelMetrics, getLifecycleMetrics } from '../api'
import { TelemetryDashboard } from '../components/TelemetryDashboard'

interface MonitoringPageProps {
  token: string
  onAuthError?: (error: unknown) => boolean
}

/**
 * Módulo "Monitoreo" (TEL-04): indicadores de "Process (Lifecycle)" (OE4) del USUARIO
 * autenticado — solo sus modelos/espacios/ejecuciones. Vista general + Por modelo.
 */
export function MonitoringPage({ token, onAuthError }: MonitoringPageProps) {
  return (
    <TelemetryDashboard
      token={token}
      onAuthError={onAuthError}
      title="Monitoreo"
      subtitle="Indicadores del ciclo de vida (OE4 · Process/Lifecycle) de tus proyectos"
      scope="user"
      loadLifecycle={getLifecycleMetrics}
      loadByModel={getByModelMetrics}
      downloadCsv={downloadLifecycleCsv}
    />
  )
}
