import { authorizedRequest, fetchJson, sendJson, sendText, sendVoid } from '@/shared/api/client'

import type { PipelineFormData, PipelineSummary, WorkspaceFormData, WorkspaceSummary } from './types'

export const listAllWorkspaces = (token: string) => (
  fetchJson<WorkspaceSummary[]>('/workspaces/all', token)
)

export const listMyWorkspaces = (token: string) => (
  fetchJson<WorkspaceSummary[]>('/workspaces', token)
)

export const getWorkspaceById = (token: string, workspaceId: number) => (
  fetchJson<WorkspaceSummary>(`/workspaces/${workspaceId}`, token)
)

export const listWorkspacePipelines = (token: string, workspaceId: number) => (
  fetchJson<PipelineSummary[]>(`/workspaces/${workspaceId}/pipelines`, token)
)

export const getPipelineById = (token: string, workspaceId: number, pipelineId: number) => (
  fetchJson<PipelineSummary>(`/workspaces/${workspaceId}/pipelines/${pipelineId}`, token)
)

export const createWorkspace = (token: string, payload: WorkspaceFormData) => (
  sendJson<WorkspaceSummary>('/workspaces', token, 'POST', payload)
)

export const updateWorkspace = (token: string, workspaceId: number, payload: WorkspaceFormData) => (
  sendJson<WorkspaceSummary>(`/workspaces/${workspaceId}`, token, 'PUT', payload)
)

export const deleteWorkspace = (token: string, workspaceId: number) => (
  sendVoid(`/workspaces/${workspaceId}`, token, 'DELETE')
)

export const uploadDataset = (token: string, workspaceId: number, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return sendText(`/workspaces/${workspaceId}/dataset`, token, 'POST', formData)
}

export const uploadDatasetFromUrl = async (
    token: string,
    workspaceId: number,
    url: string,
) => {
  const response = await authorizedRequest(
      `/workspaces/${workspaceId}/dataset/url`,
      token,
      { method: 'POST', body: JSON.stringify({ url }) },
  )
  return response.text()
}

export const registerKerasDataset = async (
    token: string,
    workspaceId: number,
    kerasDataset: string,
) => {
  const response = await authorizedRequest(
      `/workspaces/${workspaceId}/dataset/url`,
      token,
      { method: 'POST', body: JSON.stringify({ kerasDataset }) },
  )
  return response.text()
}

export const deleteDataset = (token: string, workspaceId: number, filename: string) => (
  sendVoid(`/workspaces/${workspaceId}/dataset/${filename}`, token, 'DELETE')
)

export interface StorageLimits {
  maxFileSizeMb: number
  maxWorkspaceMb: number
  allowedExtensions: string[]
}

// Límites efectivos del backend (fuente única de verdad). El frontend ya no hardcodea
// ni depende de una variable de build potencialmente desincronizada.
export const getStorageLimits = (token: string) => (
  fetchJson<StorageLimits>('/storage/limits', token)
)

export const createPipeline = (token: string, workspaceId: number, payload: PipelineFormData) => (
  sendJson<PipelineSummary>(`/workspaces/${workspaceId}/pipelines`, token, 'POST', payload)
)

export const renamePipeline = (token: string, workspaceId: number, pipelineId: number, name: string) => (
  sendJson<PipelineSummary>(`/workspaces/${workspaceId}/pipelines/${pipelineId}/rename`, token, 'PATCH', { name })
)

export const deletePipeline = (token: string, workspaceId: number, pipelineId: number) => (
  sendVoid(`/workspaces/${workspaceId}/pipelines/${pipelineId}`, token, 'DELETE')
)
