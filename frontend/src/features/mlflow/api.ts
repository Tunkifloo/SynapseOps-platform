import { fetchJson } from '@/shared/api/client'

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
}

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