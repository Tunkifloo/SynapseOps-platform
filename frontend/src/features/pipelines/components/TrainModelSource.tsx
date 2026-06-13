import { useEffect, useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'

import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { cn } from '@/lib/utils'
import { listWorkspaceModels, type WorkspaceModel } from '@/features/mlflow/api'
import type { NodeConfig } from '@/features/pipelines/nodeConfig'

interface TrainModelSourceProps {
  token: string
  workspaceId: number
  config: NodeConfig
  onConfigChange: (patch: NodeConfig) => void
  onAuthError: (error: unknown) => boolean
}

/**
 * Selección del modelo del nodo de Entrenamiento (HU-027/Item 3):
 *  - "Nuevo": el usuario nombra un modelo nuevo.
 *  - "Re-entrenar": elige un modelo existente del workspace → el entrenamiento
 *    crea una NUEVA versión del mismo modelo (no se pide nombre).
 */
export function TrainModelSource({
  token, workspaceId, config, onConfigChange, onAuthError,
}: TrainModelSourceProps) {
  const mode = String(config.modelMode ?? 'new')
  const modelName = String(config.modelName ?? '')
  const [models, setModels] = useState<WorkspaceModel[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (mode !== 'existing') return
    let active = true
    setLoading(true)
    listWorkspaceModels(token, workspaceId)
      .then((m) => { if (active) setModels(m) })
      .catch((err) => { if (!onAuthError(err)) setModels([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspaceId, mode])

  const setMode = (next: string) => {
    if (next === mode) return
    // Al cambiar de modo se limpia el nombre para evitar arrastrar el anterior.
    onConfigChange({ modelMode: next, modelName: '' })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Modelo</p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('new')}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors duration-150 ease-out-quart',
            mode === 'new' ? 'border-primary/50 bg-primary/10 text-primary-strong' : 'border-border text-muted-foreground hover:bg-accent/40'
          )}
        >
          <Sparkles className="size-3.5" /> Nuevo
        </button>
        <button
          type="button"
          onClick={() => setMode('existing')}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors duration-150 ease-out-quart',
            mode === 'existing' ? 'border-primary/50 bg-primary/10 text-primary-strong' : 'border-border text-muted-foreground hover:bg-accent/40'
          )}
        >
          <RotateCcw className="size-3.5" /> Re-entrenar
        </button>
      </div>

      {mode === 'new' ? (
        <div className="space-y-1.5">
          <Label htmlFor="train-model-name">Nombre del nuevo modelo</Label>
          <Input
            id="train-model-name"
            value={modelName}
            placeholder="mnist_cnn_demo"
            onChange={(e) => onConfigChange({ modelName: e.target.value })}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="train-model-existing">Modelo a re-entrenar</Label>
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner size="sm" /> Cargando modelos…</p>
          ) : models.length === 0 ? (
            <p className="text-xs text-warning-strong">Aún no hay modelos en este proyecto. Entrena uno nuevo primero.</p>
          ) : (
            <Select value={modelName} onValueChange={(v) => onConfigChange({ modelName: v })}>
              <SelectTrigger id="train-model-existing"><SelectValue placeholder="Selecciona un modelo" /></SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.name} value={m.name}>{m.name} · v{m.latestVersion}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            El re-entrenamiento registra una <span className="font-medium text-foreground">nueva versión</span> del modelo elegido.
          </p>
        </div>
      )}
    </div>
  )
}
