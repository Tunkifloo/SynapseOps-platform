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
  type FieldDef,
  type NodeConfig,
} from '@/features/pipelines/nodeConfig'
import type { PipelineNodeData } from './PipelineNode'

interface NodeConfigPanelProps {
  data: PipelineNodeData
  onSave: (label: string, config: NodeConfig) => void
  onClose: () => void
}

/**
 * Panel lateral derecho de configuración de nodos (HU-021).
 * Debe montarse con `key={node.id}` para reinicializar el formulario al cambiar de nodo.
 * "Guardar" aplica al estado del lienzo; cerrar/Cancelar descarta los cambios.
 */
export function NodeConfigPanel({ data, onSave, onClose }: NodeConfigPanelProps) {
  const cfg = NODE_KIND_MAP[data.kind]
  const Icon = cfg.icon
  const fields = NODE_FIELDS[data.kind]

  const [label, setLabel] = useState(data.label)
  const [config, setConfig] = useState<NodeConfig>({
    ...defaultConfig(data.kind),
    ...(data.config ?? {}),
  })

  const setField = (name: string, value: string | number) =>
    setConfig((prev) => ({ ...prev, [name]: value }))

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

        {fields.length > 0 ? (
          fields.map(renderField)
        ) : (
          <p className="rounded-xl border border-border bg-card/40 p-3 text-sm text-muted-foreground">
            El despliegue dinámico se configura en el Sprint 3.
          </p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="cta" onClick={() => onSave(label.trim() || cfg.label, config)}>
          Guardar
        </Button>
      </footer>
    </aside>
  )
}
