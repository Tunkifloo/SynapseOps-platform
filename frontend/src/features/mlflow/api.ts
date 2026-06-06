import { fetchJson, sendJson, sendVoid } from '@/shared/api/client'

export interface MlflowHealth {
    status: string
    service: string
    uri: string
}

export interface MlflowExperiment {
    experimentId: string
    name: string
    lifecycleStage: string
}

export interface MlflowModel {
    name: string
    latestVersion: string
    latestRunId: string
}

export interface MlflowModelVersion {
    version: string
    runId: string
    status: string
    stage: string
    creationTimestamp: number
    description: string
    /** Métricas embebidas (registro por workspace, desde ml_artifacts). */
    accuracy?: number
    loss?: number
}

/** Stages válidos del Model Registry (metadata de registro, no despliegue). */
export type ModelStage = 'None' | 'Staging' | 'Production' | 'Archived'

export interface MlflowRunSummary {
    runId: string
    status: string
    artifactUri: string
    metrics: Record<string, number>
    params: Record<string, string>
}

export const getMlflowHealth = (token: string) =>
    fetchJson<MlflowHealth>('/mlflow/health', token)

export const listMlflowExperiments = (token: string) =>
    fetchJson<MlflowExperiment[]>('/mlflow/experiments', token)

export const listMlflowModels = (token: string) =>
    fetchJson<MlflowModel[]>('/mlflow/models', token)

export const getMlflowModelVersions = (token: string, modelName: string) =>
    fetchJson<MlflowModelVersion[]>(`/mlflow/models/${modelName}/versions`, token)

export const getMlflowRunSummary = (token: string, runId: string) =>
    fetchJson<MlflowRunSummary>(`/mlflow/runs/${runId}`, token)

// ── Registro con alcance por workspace (HU-027 · RBAC DN-3) ──────────────────
// COLLABORATOR/owner: CRUD sobre lo suyo. ADMIN: lectura sobre lo ajeno.

export interface WorkspaceModel {
    name: string
    latestVersion: string
    latestRunId: string
    ownedVersions: number
}

export const listWorkspaceModels = (token: string, workspaceId: number) =>
    fetchJson<WorkspaceModel[]>(`/workspaces/${workspaceId}/models`, token)

export const getWorkspaceModelVersions = (token: string, workspaceId: number, modelName: string) =>
    fetchJson<MlflowModelVersion[]>(
        `/workspaces/${workspaceId}/models/${encodeURIComponent(modelName)}/versions`, token)

export const deleteWorkspaceModelVersion = (
    token: string, workspaceId: number, modelName: string, version: string,
) =>
    sendVoid(
        `/workspaces/${workspaceId}/models/${encodeURIComponent(modelName)}/versions/${version}`,
        token, 'DELETE')

export const transitionWorkspaceModelStage = (
    token: string, workspaceId: number, modelName: string, version: string, stage: ModelStage,
) =>
    sendJson<{ name: string; version: string; stage: string }>(
        `/workspaces/${workspaceId}/models/${encodeURIComponent(modelName)}/versions/${version}/stage`,
        token, 'POST', { stage })