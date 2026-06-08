import type { Edge, Node } from 'reactflow'

import { authorizedRequest } from '@/shared/api/client'
import type { PipelineNodeData } from '@/features/pipelines/components/PipelineNode'

export interface CanvasState {
  nodes: Node<PipelineNodeData>[]
  edges: Edge[]
}

const canvasUrl = (workspaceId: number, pipelineId: number) =>
  `/workspaces/${workspaceId}/pipelines/${pipelineId}/canvas`

/** Persiste la topología del lienzo en el backend (HU-024). */
export const saveCanvas = async (
  token: string,
  workspaceId: number,
  pipelineId: number,
  canvas: CanvasState,
) => {
  await authorizedRequest(canvasUrl(workspaceId, pipelineId), token, {
    method: 'PUT',
    body: JSON.stringify(canvas),
  })
}

/** Carga la topología guardada del pipeline (o un lienzo vacío). */
export const loadCanvas = async (
  token: string,
  workspaceId: number,
  pipelineId: number,
): Promise<CanvasState> => {
  const response = await authorizedRequest(canvasUrl(workspaceId, pipelineId), token, {
    method: 'GET',
  })
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as Partial<CanvasState>
    return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}
