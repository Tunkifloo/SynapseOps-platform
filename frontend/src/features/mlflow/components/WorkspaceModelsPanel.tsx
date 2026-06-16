import { useMemo } from 'react'

import {
  deleteWorkspaceModelVersion,
  getWorkspaceModelVersionDetails,
  getWorkspaceModelVersions,
  listWorkspaceModels,
  parseConfusion,
  transitionWorkspaceModelStage,
} from '../api'
import { ModelRegistry, type RegistryApi } from './ModelRegistry'
import { deployModel } from '@/features/deployments/api'

interface WorkspaceModelsPanelProps {
  token: string
  workspaceId: number
  onAuthError: (error: unknown) => boolean
}

/**
 * Registro de modelos con alcance de workspace (HU-027). CRUD completo para el
 * dueño (COLLABORATOR o ADMIN propietario); el backend aplica DN-3. Las métricas
 * vienen embebidas desde ml_artifacts (no requiere el endpoint ADMIN de MLflow).
 */
export function WorkspaceModelsPanel({ token, workspaceId, onAuthError }: WorkspaceModelsPanelProps) {
  const api: RegistryApi = useMemo(() => ({
    listModels: () => listWorkspaceModels(token, workspaceId),
    getVersions: (name) => getWorkspaceModelVersions(token, workspaceId, name),
    deleteVersion: (name, version) => deleteWorkspaceModelVersion(token, workspaceId, name, version),
    transitionStage: (name, version, stage) =>
      transitionWorkspaceModelStage(token, workspaceId, name, version, stage),
    getDetails: async (name, version) => {
      const s = await getWorkspaceModelVersionDetails(token, workspaceId, name, version)
      return { params: s.params ?? {}, metrics: s.metrics ?? {}, confusionMatrix: parseConfusion(s.tags), scorecam: s.scorecam ?? null }
    },
    allowDeploy: true,
    deploy: (runId) => deployModel(token, runId),
  }), [token, workspaceId])

  return <ModelRegistry api={api} onAuthError={onAuthError} />
}
