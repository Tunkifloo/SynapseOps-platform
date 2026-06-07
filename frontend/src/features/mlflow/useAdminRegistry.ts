import { useEffect, useState } from 'react'

import {
  getMlflowModelVersions,
  getMlflowRunSummary,
  listMlflowExperiments,
  listMlflowModels,
  type MlflowModelVersion,
} from '@/features/mlflow/api'

export type StageKey = 'None' | 'Staging' | 'Production' | 'Archived'

/** Fila de modelo del registro global (versión más reciente + todas sus versiones). */
export interface AdminModelRow {
  name: string
  latestVersion: string
  latestStage: string
  latestAccuracy: number | null
  versions: MlflowModelVersion[]
}

export interface AdminRegistryState {
  totalModels: number | null
  totalVersions: number | null
  inProduction: number | null
  experiments: number | null
  byStage: Record<StageKey, number>
  rows: AdminModelRow[]
  loading: boolean
}

const INITIAL: AdminRegistryState = {
  totalModels: null,
  totalVersions: null,
  inProduction: null,
  experiments: null,
  byStage: { None: 0, Staging: 0, Production: 0, Archived: 0 },
  rows: [],
  loading: true,
}

/**
 * Métricas a nivel plataforma del Model Registry (ADMIN, solo-lectura): usa los
 * endpoints globales de MLflow + fan-out de versiones por modelo. Best-effort.
 * Escucha `synapseops:refresh-mlflow` para recargar junto al panel.
 */
export function useAdminRegistry(token: string, onAuthError: (e: unknown) => boolean): AdminRegistryState {
  const [state, setState] = useState<AdminRegistryState>(INITIAL)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setState((s) => ({ ...s, loading: true }))
      let models: { name: string }[]
      let experiments: number
      try {
        const [m, exps] = await Promise.all([listMlflowModels(token), listMlflowExperiments(token)])
        models = m
        experiments = exps.length
      } catch (err) {
        if (cancelled || onAuthError(err)) return
        setState({ ...INITIAL, loading: false })
        return
      }
      if (cancelled) return

      const verRes = await Promise.allSettled(models.map((m) => getMlflowModelVersions(token, m.name)))
      if (cancelled) return

      const byStage: Record<StageKey, number> = { None: 0, Staging: 0, Production: 0, Archived: 0 }
      let totalVersions = 0
      const rows: AdminModelRow[] = verRes.map((res, i) => {
        const versions = res.status === 'fulfilled' ? res.value : []
        versions.forEach((v) => {
          totalVersions += 1
          const stage = (['None', 'Staging', 'Production', 'Archived'] as StageKey[]).includes(v.stage as StageKey)
            ? (v.stage as StageKey)
            : 'None'
          byStage[stage] += 1
        })
        const latest = [...versions].sort((a, b) => Number(b.version) - Number(a.version))[0]
        return {
          name: models[i].name,
          latestVersion: latest?.version ?? '—',
          latestStage: latest?.stage ?? 'None',
          latestAccuracy: latest?.accuracy ?? null,
          versions,
        }
      })
      // El registro global de MLflow no embebe accuracy en las versiones →
      // se resuelve vía run-summary de la versión más reciente de cada modelo.
      const accRes = await Promise.allSettled(
        rows.map((r) => {
          const latest = [...r.versions].sort((a, b) => Number(b.version) - Number(a.version))[0]
          return latest?.runId ? getMlflowRunSummary(token, latest.runId) : Promise.resolve(null)
        })
      )
      if (cancelled) return
      accRes.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value && rows[i].latestAccuracy == null) {
          const m = res.value.metrics
          rows[i].latestAccuracy = m.test_accuracy ?? m.val_accuracy ?? m.accuracy ?? null
        }
      })

      rows.sort((a, b) => a.name.localeCompare(b.name))

      setState({
        totalModels: models.length,
        totalVersions,
        inProduction: byStage.Production,
        experiments,
        byStage,
        rows,
        loading: false,
      })
    }

    void run()
    const refresh = () => void run()
    window.addEventListener('synapseops:refresh-mlflow', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('synapseops:refresh-mlflow', refresh)
    }
  }, [token, onAuthError])

  return state
}
