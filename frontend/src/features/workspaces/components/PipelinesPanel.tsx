import type { FormEvent } from 'react'
import { Play } from 'lucide-react'

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
  selectedForExecId: number | null
  onPipelineNameChange: (value: string) => void
  onRenameValueChange: (value: string) => void
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onStartRename: (pipeline: PipelineSummary) => void
  onCancelRename: () => void
  onSaveRename: (pipelineId: number) => Promise<void>
  onDelete: (pipelineId: number) => Promise<void>
  onSelectForExec: (pipeline: PipelineSummary) => void
}

export function PipelinesPanel({
                                 pipelines,
                                 isLoadingPipelines,
                                 pipelineName,
                                 isSavingPipeline,
                                 renamingPipelineId,
                                 renameValue,
                                 selectedForExecId,
                                 onPipelineNameChange,
                                 onRenameValueChange,
                                 onCreate,
                                 onStartRename,
                                 onCancelRename,
                                 onSaveRename,
                                 onDelete,
                                 onSelectForExec,
                               }: PipelinesPanelProps) {
  return (
      <div className="space-y-6">
        {/* ── Crear pipeline ── */}
        <Card className="border-white/5 bg-black/20">
          <CardHeader>
            <CardTitle className="text-white">Pipeline Isolation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">
              Cada pipeline opera sobre el dataset aislado del workspace activo.
            </p>
            <form className="space-y-3" onSubmit={(event) => void onCreate(event)}>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  New Pipeline
                </label>
                <Input
                    value={pipelineName}
                    onChange={(event) => onPipelineNameChange(event.target.value)}
                    placeholder="Training Pipeline"
                    required
                />
              </div>
              <Button type="submit" disabled={isSavingPipeline}>
                {isSavingPipeline ? 'Saving...' : 'Create Pipeline'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Lista de pipelines ── */}
        <Card className="border-white/5 bg-black/20">
          <CardHeader>
            <CardTitle className="text-white">Workspace Pipelines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingPipelines && (
                <p className="text-sm text-slate-400">Loading pipelines...</p>
            )}
            {!isLoadingPipelines && pipelines.length === 0 && (
                <p className="text-sm text-slate-400">
                  No pipelines attached to this workspace.
                </p>
            )}

            {pipelines.map((item) => (
                <div
                    key={item.idPipeline}
                    className={`rounded-2xl border p-4 transition-all ${
                        selectedForExecId === item.idPipeline
                            ? 'border-blue-500/40 bg-blue-500/5'
                            : 'border-white/5 bg-white/[0.03]'
                    }`}
                >
                  {renamingPipelineId === item.idPipeline ? (
                      // Modo edición nombre
                      <div className="space-y-3">
                        <Input
                            value={renameValue}
                            onChange={(event) => onRenameValueChange(event.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                              size="sm"
                              onClick={() => void onSaveRename(item.idPipeline)}
                              disabled={isSavingPipeline}
                          >
                            Save Name
                          </Button>
                          <Button variant="outline" size="sm" onClick={onCancelRename}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                  ) : (
                      // Modo normal
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-white">{item.name}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              Status:{' '}
                              <span className={
                                item.status === 'COMPLETED' ? 'text-emerald-400' :
                                    item.status === 'RUNNING'   ? 'text-blue-400' :
                                        item.status === 'FAILED'    ? 'text-red-400' :
                                            'text-slate-400'
                              }>
                          {item.status}
                        </span>
                            </p>
                            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              Executions: {item.executionCount}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {/* Botón Run — abre ExecutionPanel */}
                            <button
                                onClick={() => onSelectForExec(item)}
                                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                    selectedForExecId === item.idPipeline
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40'
                                }`}
                            >
                              <Play size={10} />
                              {selectedForExecId === item.idPipeline ? 'Selected' : 'Run'}
                            </button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onStartRename(item)}
                                className="text-xs"
                            >
                              Rename
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => void onDelete(item.idPipeline)}
                                className="text-xs"
                            >
                              Delete
                            </Button>
                          </div>
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