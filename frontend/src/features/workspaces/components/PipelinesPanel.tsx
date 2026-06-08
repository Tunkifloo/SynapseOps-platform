import type { FormEvent } from 'react'
import { Play, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

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
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-50">Aislamiento de pipeline</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Cada pipeline opera sobre el dataset aislado del workspace activo.
          </p>
        </div>

        <form className="space-y-3" onSubmit={(event) => void onCreate(event)}>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-100">Nuevo pipeline</label>
            <Input
              value={pipelineName}
              onChange={(event) => onPipelineNameChange(event.target.value)}
              placeholder="Training Pipeline"
              required
              className="h-11 rounded-xl border-slate-700/80 bg-slate-950/40 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500/20"
            />
          </div>
          <Button
            type="submit"
            disabled={isSavingPipeline}
            className="h-10 border border-slate-700/80 bg-slate-900 text-slate-100 hover:bg-slate-800"
          >
            {isSavingPipeline ? 'Guardando...' : 'Crear pipeline'}
          </Button>
        </form>
      </section>

      <div className="h-px bg-slate-800/90" />

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-50">Pipelines del espacio de trabajo</h3>

        {isLoadingPipelines && (
          <p className="text-sm text-slate-400">Cargando pipelines...</p>
        )}
        {!isLoadingPipelines && pipelines.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-700/70 p-4 text-sm text-slate-500">
            No hay pipelines asociados a este proyecto.
          </p>
        )}

        {pipelines.map((item) => (
          <div
            key={item.idPipeline}
            className={`rounded-xl border p-4 transition-colors ${
              selectedForExecId === item.idPipeline
                ? 'border-blue-500/50 bg-blue-500/10'
                : 'border-slate-800/80 bg-slate-950/30 hover:border-slate-700'
            }`}
          >
            {renamingPipelineId === item.idPipeline ? (
              <div className="space-y-3">
                <Input
                  value={renameValue}
                  onChange={(event) => onRenameValueChange(event.target.value)}
                  className="h-10 rounded-xl border-slate-700/80 bg-slate-950/40 text-sm text-slate-100 focus-visible:ring-blue-500/20"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void onSaveRename(item.idPipeline)}
                    disabled={isSavingPipeline}
                    className="bg-blue-600 text-white hover:bg-blue-500"
                  >
                    Guardar
                  </Button>
                  <Button variant="outline" size="sm" onClick={onCancelRename}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-slate-50">{item.name}</p>
                  <p className="mt-3 text-sm text-slate-400">
                    Estado: <span className="text-slate-300">{item.status}</span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Ejecuciones: {item.executionCount}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => onSelectForExec(item)}
                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
                      selectedForExecId === item.idPipeline
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15'
                    }`}
                  >
                    <Play size={13} />
                    {selectedForExecId === item.idPipeline ? 'Seleccionado' : 'Ejecutar'}
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStartRename(item)}
                    className="h-9 border-slate-700/80 bg-slate-900/60 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    Renombrar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void onDelete(item.idPipeline)}
                    className="h-9 border border-red-500/25 bg-red-500/10 text-xs text-red-300 hover:bg-red-500/15"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
