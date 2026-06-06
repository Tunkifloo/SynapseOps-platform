import { useState } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { NODE_KIND_MAP } from '@/features/pipelines/nodeKinds'
import {
  NODE_FIELDS,
  defaultConfig,
  validateConfig,
  type FieldDef,
  type NodeConfig,
} from '@/features/pipelines/nodeConfig'
import type { PipelineNodeData, PipelineNodeStatus } from './PipelineNode'
import { IngestActions } from './IngestActions'
import { TrainActions } from './TrainActions'
import { TrainMetrics } from './TrainMetrics'
import { DeployActions } from './DeployActions'

export interface IngestContext {
  token: string
  workspaceId: number
  onAssigned: (descriptor: string) => void
}

export interface TrainContext {
  canRun: boolean
  onExecute: (config: NodeConfig) => void
}

export interface DeployContext {
  token: string
  workspaceId: number
  pipelineId: number | null
  projectName: string
  onAuthError: (error: unknown) => boolean
}

interface NodeConfigPanelProps {
  data: PipelineNodeData
  ingest?: IngestContext
  train?: TrainContext
  deploy?: DeployContext
  onSave: (label: string, config: NodeConfig, status: PipelineNodeStatus, error?: string) => void
  onClose: () => void
}

const STATUS_OPTIONS: { value: PipelineNodeStatus; label: string }[] = [
  { value: 'idle', label: 'Inactivo' },
  { value: 'running', label: 'En ejecución' },
  { value: 'success', label: 'Completado' },
  { value: 'error', label: 'Error' },
]

/**
 * Panel lateral derecho de configuración de nodos (HU-021).
 * Debe montarse con `key={node.id}` para reinicializar el formulario al cambiar de nodo.
 * "Guardar" aplica al estado del lienzo; cerrar/Cancelar descarta los cambios.
 */
export function NodeConfigPanel({ data, ingest, train, deploy, onSave, onClose }: NodeConfigPanelProps) {
  const cfg = NODE_KIND_MAP[data.kind]
  const Icon = cfg.icon
  const fields = NODE_FIELDS[data.kind]

  const [label, setLabel] = useState(data.label)
  const [config, setConfig] = useState<NodeConfig>({
    ...defaultConfig(data.kind),
    ...(data.config ?? {}),
  })
  const [status, setStatus] = useState<PipelineNodeStatus>(data.status ?? 'idle')
  const [errorMsg, setErrorMsg] = useState(data.error ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const setField = (name: string, value: string | number) => {
    setValidationError(null)
    setConfig((prev) => ({ ...prev, [name]: value }))
  }

  const mergeConfig = (patch: NodeConfig) => {
    setValidationError(null)
    setConfig((prev) => ({ ...prev, ...patch }))
  }

  const handleSave = () => {
    const error = validateConfig(data.kind, config)
    if (error) {
      setValidationError(error)
      return
    }
    onSave(label.trim() || cfg.label, config, status, status === 'error' ? errorMsg : undefined)
  }

  const renderField = (field: FieldDef) => {
    if (field.showIf && !field.showIf(config)) return null
    const value = config[field.name] ?? ''
    const id = `cfg-${field.name}`

    return (
      <div key={field.name} className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        {field.type === 'select' ? (
          <Select value={String(value)} onValueChange={(v) => setField(field.name, v)}>
            <SelectTrigger id={id}>
              <SelectValue placeholder="Selecciona…" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={id}
            type={field.type}
            value={String(value)}
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.placeholder}
            onChange={(e) =>
              setField(
                field.name,
                field.type === 'number'
                  ? e.target.value === ''
                    ? ''
                    : Number(e.target.value)
                  : e.target.value
              )
            }
          />
        )}
        {field.help && <p className="text-[11px] text-muted-foreground">{field.help}</p>}
      </div>
    )
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-80 max-w-[88%] flex-col border-l border-border bg-card shadow-2xl">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{cfg.label}</p>
          <p className="truncate text-[11px] text-muted-foreground">Configuración del nodo</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar panel">
          <X />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="cfg-label">Nombre del nodo</Label>
          <Input id="cfg-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        {fields.length > 0 && fields.map(renderField)}

        {data.kind === 'deploy' && deploy && (
          <DeployActions
            token={deploy.token}
            workspaceId={deploy.workspaceId}
            pipelineId={deploy.pipelineId}
            projectName={deploy.projectName}
            config={config}
            onConfigChange={mergeConfig}
            onAuthError={deploy.onAuthError}
          />
        )}

        {data.kind === 'deploy' && !deploy && (
          <p className="rounded-xl border border-border bg-card/40 p-3 text-sm text-muted-foreground">
            Selecciona un proyecto y un pipeline para configurar el despliegue.
          </p>
        )}

        {data.kind === 'split' && (
          <p className="rounded-lg bg-card/40 px-3 py-2 text-xs text-muted-foreground">
            Train <span className="font-mono text-foreground">{Number(config.trainRatio) || 0}%</span>{' '}
            · Validación/Test{' '}
            <span className="font-mono text-foreground">
              {100 - (Number(config.trainRatio) || 0)}%
            </span>{' '}
            (estratificado por clase en el ML engine).
          </p>
        )}

        {data.kind === 'ingest' && ingest && (
          <IngestActions
            token={ingest.token}
            workspaceId={ingest.workspaceId}
            mode={String(config.mode ?? 'keras')}
            kerasDataset={String(config.kerasDataset ?? '')}
            url={String(config.url ?? '')}
            onAssigned={ingest.onAssigned}
          />
        )}

        {data.kind === 'train' && (
          <TrainMetrics status={data.status} metrics={data.config?.metrics} runId={data.config?.runId} />
        )}

        {data.kind === 'train' && train && (
          <TrainActions config={config} canRun={train.canRun} onExecute={train.onExecute} />
        )}

        <div className="space-y-1.5 border-t border-border pt-4">
          <Label htmlFor="cfg-status">Estado (vista previa)</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as PipelineNodeStatus)}>
            <SelectTrigger id="cfg-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Se actualizará automáticamente durante la ejecución (HU-005 / HU-023).
          </p>
        </div>

        {status === 'error' && (
          <div className="space-y-1.5">
            <Label htmlFor="cfg-error">Mensaje de error</Label>
            <Input
              id="cfg-error"
              value={errorMsg}
              onChange={(e) => setErrorMsg(e.target.value)}
              placeholder="Resumen del error"
            />
          </div>
        )}

        {validationError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {validationError}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="cta" onClick={handleSave}>
          Guardar
        </Button>
      </footer>
    </aside>
  )
}
