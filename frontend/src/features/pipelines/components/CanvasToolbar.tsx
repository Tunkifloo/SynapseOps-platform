import { useState } from 'react'
import { Panel, useReactFlow } from 'reactflow'
import { Maximize, Minus, Play, Plus, Save, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'

interface CanvasToolbarProps {
  projectName: string
  nodeCount: number
  saving?: boolean
  dirty?: boolean
  flowRunning?: boolean
  canRunFlow?: boolean
  onClear: () => void
  onSave: () => void
  onStartFlow: () => void
}

export function CanvasToolbar({
  projectName,
  nodeCount,
  saving = false,
  dirty = false,
  flowRunning = false,
  canRunFlow = false,
  onClear,
  onSave,
  onStartFlow,
}: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const empty = nodeCount === 0

  return (
    <Panel position="top-left" className="!m-2 sm:!m-3 max-w-[calc(100%-1rem)]">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur-md">
        <span className="hidden px-2 text-xs sm:inline">
          <span className="text-muted-foreground">Proyecto:</span>{' '}
          <span className="font-mono font-medium text-foreground">{projectName}</span>
        </span>

        <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" aria-hidden="true" />

        <Button variant="ghost" size="icon-sm" onClick={() => zoomIn()} aria-label="Acercar">
          <Plus />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => zoomOut()} aria-label="Alejar">
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          aria-label="Ajustar vista"
        >
          <Maximize />
        </Button>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

        <Button variant="ghost" size="sm" disabled={empty || flowRunning} onClick={() => setConfirmOpen(true)}>
          <Trash2 />
          <span className="hidden sm:inline">Limpiar</span>
        </Button>
        <Button
          variant={dirty ? 'cta' : 'outline'}
          size="sm"
          disabled={empty || flowRunning}
          loading={saving}
          onClick={onSave}
          title={dirty ? 'Hay cambios sin guardar' : 'Lienzo guardado'}
        >
          <Save />
          <span className="hidden sm:inline">Guardar</span>
          {dirty && <span className="ml-1 inline-block size-1.5 rounded-full bg-current" aria-label="sin guardar" />}
        </Button>
        <Button
          data-tour="start-flow"
          variant="cta"
          size="sm"
          disabled={empty || !canRunFlow}
          loading={flowRunning}
          onClick={onStartFlow}
        >
          <Play />
          Iniciar flujo
        </Button>
      </div>

      {/* Confirmación de acción destructiva (RN-007) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Limpiar el lienzo?</DialogTitle>
            <DialogDescription>
              Se eliminarán todos los nodos y conexiones del pipeline. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                onClear()
                setConfirmOpen(false)
              }}
            >
              Sí, limpiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
