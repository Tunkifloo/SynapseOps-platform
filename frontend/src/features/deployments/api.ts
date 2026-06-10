import { fetchJson, sendJson, sendVoid } from '@/shared/api/client'
import type { DeploymentResponse, DeploymentsView, PredictResult } from './types'

/** Despliegues del usuario + cupo (GET /api/v1/deployments). */
export const listDeployments = (token: string) =>
  fetchJson<DeploymentsView>('/deployments', token)

/** Desplegar / redesplegar un modelo por runId (POST /api/v1/deployments). */
export const deployModel = (token: string, runId: string) =>
  sendJson<DeploymentResponse>('/deployments', token, 'POST', { runId })

/** Derribar un despliegue (DELETE /api/v1/deployments/{executionId}). */
export const undeployModel = (token: string, executionId: number) =>
  sendVoid(`/deployments/${executionId}`, token, 'DELETE')

/** Probar /predict del model-service vía proxy del backend (imagen en base64). */
export const predictWithImage = (token: string, executionId: number, base64: string) =>
  sendJson<PredictResult>(`/deployments/${executionId}/predict`, token, 'POST', { image: base64 })
