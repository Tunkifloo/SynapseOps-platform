import type { FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import type { PipelineSummary } from '../types'

interface PipelinesPanelProps {
  pipelines: PipelineSummary[]
  isLoadingPipelines: boolean
  pipelineName: string
  isSavingPipeline: boolean
  renamingPipelineId: number | null
  renameValue: string
  onPipelineNameChange: (value: string) => void
  onRenameValueChange: (value: string) => void
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onStartRename: (pipeline: PipelineSummary) => void
  onCancelRename: () => void
  onSaveRename: (pipelineId: number) => Promise<void>
  onDelete: (pipelineId: number) => Promise<void>
}

export function PipelinesPanel({
  pipelines,
  isLoadingPipelines,
  pipelineName,
  isSavingPipeline,
  renamingPipelineId,
  renameValue,
  onPipelineNameChange,
  onRenameValueChange,
  onCreate,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onDelete,
}: PipelinesPanelProps) {
  return (
    <div className="space-y-6">
      <Card className="border-white/5 bg-black/20">
        <CardHeader>
          <CardTitle className="text-white">Pipeline Isolation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">
            Los pipelines se consultan y mutan usando el `workspaceId` activo, asegurando que cada proyecto opere sobre su propio flujo.
          </p>
          <form className="space-y-3" onSubmit={(event) => void onCreate(event)}>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">New Pipeline</label>
              <Input value={pipelineName} onChange={(event) => onPipelineNameChange(event.target.value)} placeholder="Training Pipeline" required />
            </div>
            <Button type="submit" disabled={isSavingPipeline}>
              {isSavingPipeline ? 'Saving...' : 'Create Pipeline'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-white/5 bg-black/20">
        <CardHeader>
          <CardTitle className="text-white">Workspace Pipelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingPipelines && <p className="text-sm text-slate-400">Loading pipelines...</p>}
          {!isLoadingPipelines && pipelines.length === 0 && (
            <p className="text-sm text-slate-400">No pipelines attached to this workspace.</p>
          )}
          {pipelines.map((item) => (
            <div key={item.idPipeline} className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              {renamingPipelineId === item.idPipeline ? (
                <div className="space-y-3">
                  <Input value={renameValue} onChange={(event) => onRenameValueChange(event.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void onSaveRename(item.idPipeline)} disabled={isSavingPipeline}>
                      Save Name
                    </Button>
                    <Button variant="outline" size="sm" onClick={onCancelRename}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-400">Status: {item.status}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      Nodes: {item.nodeCount} · Executions: {item.executionCount}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onStartRename(item)}>
                      Rename
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => void onDelete(item.idPipeline)}>
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
