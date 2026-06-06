import { AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react'
import { Handle, Position, type NodeProps } from 'reactflow'

import { cn } from '@/lib/utils'
import { Spinner } from '@/shared/components/ui/spinner'
import { NODE_KIND_MAP, type NodeKind } from '@/features/pipelines/nodeKinds'
import type { NodeConfig } from '@/features/pipelines/nodeConfig'

/** Estados visuales del nodo (HU-019). Se actualizan en vivo en HU-005/HU-023. */
export type PipelineNodeStatus = 'idle' | 'running' | 'success' | 'error'

export interface PipelineNodeData {
  label: string
  kind: NodeKind
  status?: PipelineNodeStatus
  error?: string
  config?: NodeConfig
}

const statusRing: Record<PipelineNodeStatus, string> = {
  idle: 'ring-border',
  running: 'ring-info animate-pulse motion-reduce:animate-none',
  success: 'ring-success',
  error: 'ring-destructive',
}

const statusIcon: Record<Exclude<PipelineNodeStatus, 'idle'>, LucideIcon> = {
  running: CheckCircle2, // placeholder, no se usa (running usa Spinner)
  success: CheckCircle2,
  error: AlertTriangle,
}

const handleClass = '!size-2.5 !rounded-full !border-2 !border-background !bg-primary'

/** Indicador de estado: el color NO es el único señalizador → siempre hay icono. */
function StatusIndicator({ status, error }: { status: PipelineNodeStatus; error?: string }) {
  if (status === 'idle') return null
  if (status === 'running') {
    return <Spinner size="sm" className="text-info" label="En ejecución" />
  }
  const Icon = statusIcon[status]
  const isError = status === 'error'
  return (
    <span
      className={isError ? 'text-destructive' : 'text-success'}
      role="img"
      aria-label={isError ? `Error: ${error ?? 'fallo en el nodo'}` : 'Completado'}
      title={isError ? (error ?? 'Error en el nodo') : 'Completado'}
    >
      <Icon className="size-4" />
    </span>
  )
}

export function PipelineNode({ data, selected }: NodeProps<PipelineNodeData>) {
  const cfg = NODE_KIND_MAP[data.kind]
  const Icon = cfg?.icon
  const status = data.status ?? 'idle'

  return (
    <div
      className={cn(
        'flex min-w-[200px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-card-foreground shadow-md ring-1 transition-shadow',
        statusRing[status],
        selected && '!ring-2 !ring-primary !animate-none'
      )}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{data.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{cfg?.description}</p>
      </div>
      <StatusIndicator status={status} error={data.error} />
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  )
}
