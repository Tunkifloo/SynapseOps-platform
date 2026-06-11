import { useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'

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
import { cn } from '@/lib/utils'
import { NODE_KIND_MAP, type NodeKind } from '@/features/pipelines/nodeKinds'
import {
  NODE_FIELDS,
  defaultConfig,
  validateConfig,
  type FieldDef,
  type NodeConfig,
} from '@/features/pipelines/nodeConfig'
import type { PipelineNodeData, PipelineNodeStatus } from './PipelineNode'
import { IngestActions } from './IngestActions'
import { TrainMetrics } from './TrainMetrics'
import { TrainModelSource } from './TrainModelSource'
import { DeployActions } from './DeployActions'

export interface IngestContext {
  token: string
  workspaceId: number
  onAssigned: (descriptor: string) => void
}

export interface TrainContext {
  canRun: boolean
  onExecute: (config: NodeConfig) => void
  token: string
  workspaceId: number
  onAuthError: (error: unknown) => boolean
}

export interface DeployContext {
  token: string
  /** Output del flujo: runId/version/métricas del modelo entrenado + estado del nodo de entrenamiento. */
  flowRunId: string
  flowModelVersion: string
  flowMetrics: string
  trainStatus: PipelineNodeStatus
  /** Estado y endpoint EN VIVO del propio nodo de Despliegue (lo gobierna el auto-despliegue). */
  deployStatus: PipelineNodeStatus
  deployEndpoint: string
  /** Disparador manual del despliegue (handoff de "Mis modelos" o reintento). Actualiza el nodo. */
  onDeploy: (runId: string) => void
  onAuthError: (error: unknown) => boolean
}

interface NodeConfigPanelProps {
  data: PipelineNodeData
  ingest?: IngestContext
  train?: TrainContext
  deploy?: DeployContext
  onSave: (label: string, config: NodeConfig, status: PipelineNodeStatus, error?: string) => void
  onDelete?: () => void
  /** Cierre solicitado (X/Cancelar). El lienzo decide si confirmar cambios sin guardar. */
  onRequestClose: () => void
  /** Notifica al lienzo si el nodo tiene cambios sin guardar (para guardar el cierre). */
  onDirtyChange?: (dirty: boolean) => void
}

/** Propósito y qué ajustar en cada nodo (ayuda contextual para el usuario). */
const KIND_HELP: Record<NodeKind, string> = {
  ingest:
    'Carga el dataset que alimenta el pipeline. Elige el origen (Keras integrado, URL .zip o subir .zip) y asígnalo al proyecto.',
  preprocess:
    'Prepara las imágenes antes de entrenar: normalización de píxeles y, opcionalmente, data augmentation y tamaño de imagen.',
  split:
    'Divide el dataset en entrenamiento / validación / test. Ajusta el % de entrenamiento (50–90%); el resto se reparte automáticamente.',
  train:
    'Entrena una CNN adaptativa. Define framework, optimizador, epochs, batch size y técnicas (early stopping, batch norm). El nº de clases se autodetecta.',
  deploy:
    'Despliega como servicio de inferencia (/predict) el modelo entrenado en este flujo. El puerto se asigna automáticamente; los modelos existentes se gestionan desde "Mis modelos".',
}

// Presentación (solo lectura) del estado del nodo: lo gobierna la ejecución (SSE).
const STATUS_LABEL: Record<PipelineNodeStatus, { label: string; dot: string }> = {
  idle: { label: 'Inactivo', dot: 'bg-muted-foreground' },
  running: { label: 'En ejecución', dot: 'bg-info' },
  success: { label: 'Completado', dot: 'bg-success' },
  error: { label: 'Error', dot: 'bg-destructive' },
}

/**
 * Panel lateral derecho de configuración de nodos (HU-021).
 * Debe montarse con `key={node.id}` para reinicializar el formulario al cambiar de nodo.
 * "Guardar" aplica al estado del lienzo; cerrar/Cancelar descarta los cambios.
 */
export function NodeConfigPanel({
  data,
  ingest,
  train,
  deploy,
  onSave,
  onDelete,
  onRequestClose,
  onDirtyChange,
}: NodeConfigPanelProps) {
  const cfg = NODE_KIND_MAP[data.kind]
  const Icon = cfg.icon
  const fields = NODE_FIELDS[data.kind]

  // El nombre del nodo no es editable (lo fija el tipo de nodo).
  const [label] = useState(data.label)
  const [config, setConfig] = useState<NodeConfig>({
    ...defaultConfig(data.kind),
    ...(data.config ?? {}),
  })
  const [validationError, setValidationError] = useState<string | null>(null)

  // Línea base para detectar cambios sin guardar (solo nombre + configuración;
  // el estado lo gobierna la ejecución y no es editable aquí).
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({ label: data.label, config: { ...defaultConfig(data.kind), ...(data.config ?? {}) } })
  )
  const isDirty = useMemo(
    () => JSON.stringify({ label, config }) !== baseline,
    [label, config, baseline]
  )
  // Reporta el estado de cambios al lienzo (para confirmar el cierre / cambio de nodo).
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  // Al desmontar (cambio/cierre de nodo) limpia la marca de cambios.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

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
    // El estado/errores no se editan: se preservan tal como los dejó la ejecución.
    onSave(label.trim() || cfg.label, config, data.status ?? 'idle', data.error)
    // Tras guardar, la configuración actual pasa a ser la línea base (no dirty).
    setBaseline(JSON.stringify({ label, config }))
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
        <Button variant="ghost" size="icon-sm" onClick={onRequestClose} aria-label="Cerrar panel">
          <X />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Descripción contextual: qué es y qué ajustar en este nodo. */}
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {KIND_HELP[data.kind]}
        </p>

        {fields.length > 0 && fields.map(renderField)}

        {data.kind === 'deploy' && deploy && (
          <DeployActions
            flowRunId={deploy.flowRunId}
            flowModelVersion={deploy.flowModelVersion}
            flowMetrics={deploy.flowMetrics}
            trainStatus={deploy.trainStatus}
            deployStatus={deploy.deployStatus}
            deployEndpoint={deploy.deployEndpoint}
            onDeploy={deploy.onDeploy}
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

        {data.kind === 'train' && train && (
          <TrainModelSource
            token={train.token}
            workspaceId={train.workspaceId}
            config={config}
            onConfigChange={mergeConfig}
            onAuthError={train.onAuthError}
          />
        )}

        {data.kind === 'train' && (
          <TrainMetrics status={data.status} metrics={data.config?.metrics} runId={data.config?.runId} />
        )}
        {/* El run se dispara con "Iniciar flujo" (toda la cadena), no por nodo. */}

        <div className="space-y-1.5 border-t border-border pt-4">
          <Label>Estado del nodo</Label>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={cn('size-2.5 rounded-full', STATUS_LABEL[data.status ?? 'idle'].dot)}
              aria-hidden="true"
            />
            <span className="font-medium text-foreground">{STATUS_LABEL[data.status ?? 'idle'].label}</span>
          </div>
          {data.status === 'error' && data.error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {data.error}
            </p>
          )}
        </div>

        {validationError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {validationError}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border p-4">
        {onDelete ? (
          <Button
            variant="ghost"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" /> Eliminar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onRequestClose}>
            Cancelar
          </Button>
          <Button variant="cta" onClick={handleSave}>
            Guardar
          </Button>
        </div>
      </footer>
    </aside>
  )
}
