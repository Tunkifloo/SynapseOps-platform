export interface WorkspaceSummary {
  idWorkspace: number
  name: string
  description: string
  createdAt: string
  idUser: number
  ownerUsername: string
  datasetPath: string | null
}

export interface PipelineSummary {
  idPipeline: number
  name: string
  status: string
  idWorkspace: number
  nodeCount: number
  executionCount: number
}

export interface WorkspaceFormData {
  name: string
  description: string
}

export interface PipelineFormData {
  name: string
}

export const emptyWorkspaceForm = (): WorkspaceFormData => ({
  name: '',
  description: '',
})

export const emptyPipelineForm = (): PipelineFormData => ({
  name: '',
})

export const extractFilename = (datasetPath: string) => datasetPath.split(/[/\\]/).pop() ?? datasetPath
