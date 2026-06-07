import { useEffect, useState } from 'react'

import { listExecutions } from '@/features/executions/api'
import type { ExecutionStatus } from '@/features/executions/types'
import { getWorkspaceModelVersions, listWorkspaceModels } from '@/features/mlflow/api'
import { listMyWorkspaces, listWorkspacePipelines } from '@/features/workspaces/api'
import type { PipelineSummary, WorkspaceSummary } from '@/features/workspaces/types'

/** Ejecución enriquecida con nombre de pipeline/workspace para el feed y el gráfico. */
export interface DashboardExecution {
  idExecution: number
  status: ExecutionStatus
  startedAt: string | null
  finishedAt: string | null
  pipelineId: number
  pipelineName: string
  workspaceId: number
  workspaceName: string
}

/**
 * Estado del dashboard con carga progresiva: cada sección llega cuando puede,
 * de modo que las tarjetas baratas no esperan al fan-out de ejecuciones/modelos.
 * Las APIs son por-pipeline/por-modelo, así que la agregación se hace aquí
 * (best-effort con Promise.allSettled: si una parte falla, no rompe el resto).
 */
export interface DashboardState {
  workspaces: WorkspaceSummary[]
  datasetsLoaded: number
  pipelineCount: number | null
  executionTotal: number | null
  modelsRegistered: number | null
  modelsInProduction: number | null
  executions: DashboardExecution[]
  loadingCore: boolean
  loadingMetrics: boolean
  loadingActivity: boolean
  loadingProduction: boolean
  error: string | null
}

const INITIAL: DashboardState = {
  workspaces: [],
  datasetsLoaded: 0,
  pipelineCount: null,
  executionTotal: null,
  modelsRegistered: null,
  modelsInProduction: null,
  executions: [],
  loadingCore: true,
  loadingMetrics: true,
  loadingActivity: true,
  loadingProduction: true,
  error: null,
}

export function useDashboardData(
  token: string,
  onAuthError: (error: unknown) => boolean
): DashboardState {
  const [state, setState] = useState<DashboardState>(INITIAL)

  useEffect(() => {
    let cancelled = false
    const patch = (partial: Partial<DashboardState>) => {
      if (!cancelled) setState((prev) => ({ ...prev, ...partial }))
    }

    const run = async () => {
      setState({ ...INITIAL })

      // ── Núcleo: espacios de trabajo (1 llamada) ──────────────────────────
      let workspaces: WorkspaceSummary[]
      try {
        workspaces = await listMyWorkspaces(token)
      } catch (err) {
        if (cancelled || onAuthError(err)) return
        patch({
          loadingCore: false,
          loadingMetrics: false,
          loadingActivity: false,
          loadingProduction: false,
          error: err instanceof Error ? err.message : 'No se pudo cargar el dashboard.',
        })
        return
      }
      if (cancelled) return
      const datasetsLoaded = workspaces.filter((w) => !!w.datasetPath).length
      patch({ workspaces, datasetsLoaded, loadingCore: false, error: null })

      // ── Pipelines por workspace → conteo de pipelines + ejecuciones ──────
      const pipeRes = await Promise.allSettled(
        workspaces.map((w) => listWorkspacePipelines(token, w.idWorkspace))
      )
      if (cancelled) return
      const pipelinesByWs: { ws: WorkspaceSummary; pipelines: PipelineSummary[] }[] = []
      let pipelineCount = 0
      let executionTotal = 0
      pipeRes.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          pipelinesByWs.push({ ws: workspaces[i], pipelines: res.value })
          pipelineCount += res.value.length
          executionTotal += res.value.reduce((acc, p) => acc + (p.executionCount ?? 0), 0)
        }
      })
      patch({ pipelineCount, executionTotal, loadingMetrics: false })

      // ── Detalle de ejecuciones (solo pipelines con runs) → feed + gráfico ─
      const execTasks: { ws: WorkspaceSummary; p: PipelineSummary }[] = []
      pipelinesByWs.forEach(({ ws, pipelines }) =>
        pipelines.forEach((p) => {
          if ((p.executionCount ?? 0) > 0) execTasks.push({ ws, p })
        })
      )
      const modelsPromise = Promise.allSettled(
        workspaces.map((w) => listWorkspaceModels(token, w.idWorkspace))
      )
      const execRes = await Promise.allSettled(
        execTasks.map((t) => listExecutions(token, t.ws.idWorkspace, t.p.idPipeline))
      )
      if (cancelled) return
      const executions: DashboardExecution[] = []
      execRes.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          const { ws, p } = execTasks[i]
          res.value.forEach((e) =>
            executions.push({
              idExecution: e.idExecution,
              status: e.status,
              startedAt: e.startedAt,
              finishedAt: e.finishedAt,
              pipelineId: p.idPipeline,
              pipelineName: p.name,
              workspaceId: ws.idWorkspace,
              workspaceName: ws.name,
            })
          )
        }
      })
      patch({ executions, loadingActivity: false })

      // ── Modelos: registrados (conteo) + nombres para producción ──────────
      const modelsRes = await modelsPromise
      if (cancelled) return
      let modelsRegistered = 0
      const modelTasks: { ws: WorkspaceSummary; name: string }[] = []
      modelsRes.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          modelsRegistered += res.value.length
          res.value.forEach((m) => modelTasks.push({ ws: workspaces[i], name: m.name }))
        }
      })
      patch({ modelsRegistered })

      // ── Modelos en producción (versiones por modelo, stage = Production) ──
      const verRes = await Promise.allSettled(
        modelTasks.map((t) => getWorkspaceModelVersions(token, t.ws.idWorkspace, t.name))
      )
      if (cancelled) return
      let modelsInProduction = 0
      verRes.forEach((res) => {
        if (res.status === 'fulfilled') {
          modelsInProduction += res.value.filter((v) => v.stage === 'Production').length
        }
      })
      patch({ modelsInProduction, loadingProduction: false })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [token, onAuthError])

  return state
}
