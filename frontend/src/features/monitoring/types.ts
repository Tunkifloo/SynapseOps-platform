// Módulo "Monitoreo" (TEL-04) — tipos espejo del backend (TelemetryController).
// Indicadores de "Process (Lifecycle)" (OE4) derivados del Process Tracker (TEL-01).

export interface LifecycleMetricRow {
  executionId: number
  ownerUsername: string
  workspaceName: string
  pipelineName: string
  modelName: string | null
  status: string
  /** Tiempo de Re-entrenamiento T_re (s). */
  tRetrainSeconds: number | null
  /** Lead Time de Despliegue LT_d (s). */
  leadTimeDeploySeconds: number | null
  coldStartMs: number | null
  deployStatus: string | null
  /** Esfuerzo de Interacción: nº de nodos del lienzo low-code. */
  interactionEffort: number | null
}

export interface LifecycleMetrics {
  sampleSize: number
  completionRate: number | null
  deploySuccessRate: number | null
  avgRetrainSeconds: number | null
  avgLeadTimeDeploySeconds: number | null
  avgColdStartMs: number | null
  avgInteractionEffort: number | null
  rows: LifecycleMetricRow[]
}

/** Telemetría agrupada por modelo (pestaña "Por modelo" / Analítica global). */
export interface ModelMetrics {
  modelName: string
  ownerUsername: string
  workspaceName: string
  versions: number
  completed: number
  failed: number
  completionRate: number | null
  deploySuccessRate: number | null
  avgRetrainSeconds: number | null
  avgLeadTimeDeploySeconds: number | null
  avgColdStartMs: number | null
  bestAccuracy: number | null
  avgInteractionEffort: number | null
  lastExecutionId: number | null
}

export interface ByModelView {
  modelCount: number
  models: ModelMetrics[]
}
