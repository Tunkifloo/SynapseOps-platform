import { Handle, Position, type NodeProps } from 'reactflow'

import { cn } from '@/lib/utils'
import { NODE_KIND_MAP, type NodeKind } from '@/features/pipelines/nodeKinds'
import type { NodeConfig } from '@/features/pipelines/nodeConfig'

/** Estados visuales del nodo (HU-019 los usará en vivo). */
export type PipelineNodeStatus = 'idle' | 'running' | 'success' | 'error'

export interface PipelineNodeData {
  label: string
  kind: NodeKind
  status?: PipelineNodeStatus
  config?: NodeConfig
}

const statusRing: Record<PipelineNodeStatus, string> = {
  idle: 'ring-border',
  running: 'ring-info',
  success: 'ring-success',
  error: 'ring-destructive',
}

const handleClass =
  '!size-2.5 !rounded-full !border-2 !border-background !bg-primary'

export function PipelineNode({ data, selected }: NodeProps<PipelineNodeData>) {
  const cfg = NODE_KIND_MAP[data.kind]
  const Icon = cfg?.icon
  const status = data.status ?? 'idle'

  return (
    <div
      className={cn(
        'flex min-w-[190px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-card-foreground shadow-md ring-1 transition-shadow',
        statusRing[status],
        selected && '!ring-2 !ring-primary'
      )}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{data.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{cfg?.description}</p>
      </div>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  )
}
