// Módulo "Despliegues" (HU-029) — tipos espejo del backend (DeploymentsController).

export interface DeploymentItem {
  executionId: number
  workspaceId: number
  workspaceName: string
  modelVersion: string | null
  runId: string | null
  containerName: string | null
  port: number | null
  endpoint: string | null
  deployStatus: string | null // SUCCESS | FAILED
  coldStartMs: number | null
  running: boolean
}

export interface DeploymentsView {
  max: number
  active: number
  deployments: DeploymentItem[]
}

export interface DeploymentResponse {
  executionId: number
  containerId: string | null
  modelName: string | null
  modelVersion: string | null
  endpoint: string | null
  status: string // RUNNING | FAILED | STOPPED | NOT_DEPLOYED
}
