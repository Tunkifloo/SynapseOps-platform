import { fetchJson, sendJson } from '@/shared/api/client'
import type { ExecutionRequest, ExecutionSummary } from './types'

export const launchExecution = (
    token: string,
    workspaceId: number,
    pipelineId: number,
    payload: ExecutionRequest,
) =>
    sendJson<ExecutionSummary>(
        `/workspaces/${workspaceId}/pipelines/${pipelineId}/execute`,
        token,
        'POST',
        payload,
    )

export const listExecutions = (
    token: string,
    workspaceId: number,
    pipelineId: number,
) =>
    fetchJson<ExecutionSummary[]>(
        `/workspaces/${workspaceId}/pipelines/${pipelineId}/executions`,
        token,
    )

export const getExecution = (
    token: string,
    workspaceId: number,
    pipelineId: number,
    executionId: number,
) =>
    fetchJson<ExecutionSummary>(
        `/workspaces/${workspaceId}/pipelines/${pipelineId}/executions/${executionId}`,
        token,
    )