import { useEffect, useMemo, useState } from 'react'
import { Box, Info, Rocket, Server } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { notify } from '@/shared/notify'
import {
  getWorkspaceModelVersions,
  listWorkspaceModels,
  type MlflowModelVersion,
  type WorkspaceModel,
} from '@/features/mlflow/api'
import { consumeDeployHandoff } from '@/features/pipelines/deployHandoff'
import { deployModel } from '@/features/deployments/api'
import type { NodeConfig } from '@/features/pipelines/nodeConfig'

interface DeployActionsProps {
  token: string
  workspaceId: number
  pipelineId: number | null
  projectName: string
  config: NodeConfig
  onConfigChange: (patch: NodeConfig) => void
  onAuthError: (error: unknown) => boolean
}

function slug(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'model'
}

/** Puerto sugerido (preview de TA-002). La asignación real ocurre en el despliegue (Sprint 3). */
function suggestedPort(pipelineId: number | null): number {
  return 9000 + ((pipelineId ?? 0) % 1000)
}

/**
 * Panel del Nodo de Despliegue (HU-028, parte no-despliegue):
 * selector de versión de modelo (Model Registry del workspace), puerto asignado
 * automáticamente (preview TA-002) y nombre del contenedor a generar. El disparo
 * real del model-service (HU-007 / HU-008) se habilita en el Sprint 3.
 */
export function DeployActions({
  token,
  workspaceId,
  pipelineId,
  projectName,
  config,
  onConfigChange,
  onAuthError,
}: DeployActionsProps) {
  const [models, setModels] = useState<WorkspaceModel[]>([])
  const [versions, setVersions] = useState<MlflowModelVersion[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingVersions, setLoadingVersions] = useState(false)

  const selectedModel = String(config.modelName ?? '')
  const selectedVersion = String(config.modelVersion ?? '')
  const port = useMemo(() => suggestedPort(pipelineId), [pipelineId])

  const buildContainerName = (model: string, version: string) =>
    model && version ? `model-svc-${slug(projectName)}-${slug(model)}-v${version}` : ''

  const containerName = String(config.containerName ?? buildContainerName(selectedModel, selectedVersion))

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  // Carga los modelos del workspace y consume el handoff "Desplegar" (HU-027).
  useEffect(() => {
    let active = true
    setLoadingModels(true)
    listWorkspaceModels(token, workspaceId)
      .then((mods) => {
        if (!active) return
        setModels(mods)
        const handoff = consumeDeployHandoff()
        if (handoff && mods.some((m) => m.name === handoff.modelName)) {
          onConfigChange({
            modelName: handoff.modelName,
            modelVersion: handoff.version,
            runId: handoff.runId,
            port: suggestedPort(pipelineId),
            containerName: buildContainerName(handoff.modelName, handoff.version),
          })
          notify.info('Modelo precargado desde el Registry', {
            description: `${handoff.modelName} · v${handoff.version}`,
          })
        }
      })
      .catch((err) => { if (!onAuthError(err)) setModels([]) })
      .finally(() => { if (active) setLoadingModels(false) })
    return () => { active = false }
  }, [token, workspaceId])

  // Versiones del modelo seleccionado.
  useEffect(() => {
    if (!selectedModel) { setVersions([]); return }
    let active = true
    setLoadingVersions(true)
    getWorkspaceModelVersions(token, workspaceId, selectedModel)
      .then((v) => { if (active) setVersions(v) })
      .catch((err) => { if (!onAuthError(err)) setVersions([]) })
      .finally(() => { if (active) setLoadingVersions(false) })
    return () => { active = false }
  }, [token, workspaceId, selectedModel])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const handleModel = (value: string) => {
    onConfigChange({ modelName: value, modelVersion: '', runId: '', containerName: '' })
  }

  const handleVersion = (value: string) => {
    const match = versions.find((v) => v.version === value)
    onConfigChange({
      modelVersion: value,
      runId: match?.runId ?? '',
      port,
      containerName: buildContainerName(selectedModel, value),
    })
  }

  const ready = !!selectedModel && !!selectedVersion
  const runId = String(config.runId ?? '')

  const [deploying, setDeploying] = useState(false)
  const [deployedEndpoint, setDeployedEndpoint] = useState<string | null>(null)

  const handleDeploy = async () => {
    if (!runId) {
      notify.warning('Selecciona un modelo y versión antes de desplegar')
      return
    }
    setDeploying(true)
    try {
      const res = await deployModel(token, runId)
      if (res.status === 'RUNNING') {
        setDeployedEndpoint(res.endpoint ?? null)
        notify.success('model-service desplegado', { description: res.endpoint ?? undefined })
      } else {
        notify.error('El despliegue no pasó el health check del model-service')
      }
    } catch (err) {
      if (!onAuthError(err)) {
        notify.error('No se pudo desplegar', {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Despliegue del modelo
      </p>

      {loadingModels ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" /> Cargando modelos del proyecto…
        </p>
      ) : models.length === 0 ? (
        <p className="text-xs text-warning">
          Aún no hay modelos registrados en este proyecto. Entrena un pipeline para generar artefactos.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="deploy-model">Modelo</Label>
            <Select value={selectedModel} onValueChange={handleModel}>
              <SelectTrigger id="deploy-model">
                <SelectValue placeholder="Selecciona un modelo" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deploy-version">Versión</Label>
            <Select value={selectedVersion} onValueChange={handleVersion} disabled={!selectedModel || loadingVersions}>
              <SelectTrigger id="deploy-version">
                <SelectValue placeholder={loadingVersions ? 'Cargando…' : 'Selecciona una versión'} />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.version} value={v.version}>
                    v{v.version}{v.stage && v.stage !== 'None' ? ` · ${v.stage}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {ready && (
        <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Server className="size-3.5" />
            Puerto asignado: <span className="font-mono text-foreground">{port}</span>
            <span className="text-[10px] text-muted-foreground/70">(auto · TA-002)</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Box className="size-3.5" />
            Contenedor: <span className="truncate font-mono text-foreground" title={containerName}>{containerName}</span>
          </div>
        </div>
      )}

      <Button
        variant="cta"
        size="sm"
        className="w-full"
        onClick={() => void handleDeploy()}
        disabled={!ready || deploying}
        loading={deploying}
        title={ready ? 'Desplegar el model-service' : 'Selecciona modelo y versión'}
      >
        <Rocket />
        {deploying ? 'Desplegando…' : 'Desplegar'}
      </Button>
      {deployedEndpoint ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-success">
          <Info className="mt-0.5 size-3 shrink-0" />
          Desplegado. Endpoint <span className="font-mono">{deployedEndpoint}/predict</span>. Gestiónalo en la
          sección <span className="font-semibold">Despliegues</span>.
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          Al desplegar se levanta el <span className="font-mono">model-service</span> y su endpoint{' '}
          <span className="font-mono">/predict</span>. Puede tardar unos segundos (health check). Lo gestionas en{' '}
          <span className="font-semibold">Despliegues</span>.
        </p>
      )}
    </div>
  )
}
