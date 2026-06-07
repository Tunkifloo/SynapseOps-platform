import { useCallback, useEffect, useState } from 'react'

import { getWorkspaceModelVersions, listWorkspaceModels, type MlflowModelVersion } from '@/features/mlflow/api'
import { listMyWorkspaces } from '@/features/workspaces/api'

/** Fila de la tabla unificada: un modelo de un workspace con su versión más reciente. */
export interface ModelRow {
  key: string
  workspaceId: number
  workspaceName: string
  name: string
  latestVersion: string
  ownedVersions: number
  versions: MlflowModelVersion[]
  latestStage: string
  latestAccuracy: number | null
}

export interface MyModelsState {
  rows: ModelRow[]
  workspaces: { id: number; name: string }[]
  loading: boolean
  error: string | null
}

const INITIAL: MyModelsState = { rows: [], workspaces: [], loading: true, error: null }

/**
 * Agrega los modelos de TODOS los espacios del usuario en una sola lista
 * (fan-out: workspaces → modelos → versiones). Best-effort con allSettled.
 */
export function useMyModels(
  token: string,
  onAuthError: (error: unknown) => boolean
): MyModelsState & { reload: () => void } {
  const [state, setState] = useState<MyModelsState>(INITIAL)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setState((s) => ({ ...s, loading: true, error: null }))

      let workspaces
      try {
        workspaces = await listMyWorkspaces(token)
      } catch (err) {
        if (cancelled || onAuthError(err)) return
        setState({
          rows: [],
          workspaces: [],
          loading: false,
          error: err instanceof Error ? err.message : 'No se pudieron cargar los modelos.',
        })
        return
      }
      if (cancelled) return
      const wsList = workspaces.map((w) => ({ id: w.idWorkspace, name: w.name }))

      const modelRes = await Promise.allSettled(
        workspaces.map((w) => listWorkspaceModels(token, w.idWorkspace))
      )
      if (cancelled) return
      const flat: { ws: { id: number; name: string }; name: string; latestVersion: string; ownedVersions: number }[] = []
      modelRes.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          res.value.forEach((m) =>
            flat.push({
              ws: wsList[i],
              name: m.name,
              latestVersion: m.latestVersion,
              ownedVersions: m.ownedVersions ?? 0,
            })
          )
        }
      })

      const verRes = await Promise.allSettled(
        flat.map((f) => getWorkspaceModelVersions(token, f.ws.id, f.name))
      )
      if (cancelled) return
      const rows: ModelRow[] = verRes.map((res, i) => {
        const f = flat[i]
        const versions = res.status === 'fulfilled' ? res.value : []
        const latest = [...versions].sort((a, b) => Number(b.version) - Number(a.version))[0]
        return {
          key: `${f.ws.id}:${f.name}`,
          workspaceId: f.ws.id,
          workspaceName: f.ws.name,
          name: f.name,
          latestVersion: f.latestVersion,
          ownedVersions: f.ownedVersions || versions.length,
          versions,
          latestStage: latest?.stage ?? 'None',
          latestAccuracy: latest?.accuracy ?? null,
        }
      })
      rows.sort((a, b) => a.name.localeCompare(b.name))

      setState({ rows, workspaces: wsList, loading: false, error: null })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [token, onAuthError, nonce])

  return { ...state, reload }
}
