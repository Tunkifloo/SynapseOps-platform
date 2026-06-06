import { useState } from 'react'
import { Panel, useReactFlow } from 'reactflow'
import { Maximize, Minus, Plus, Save, Trash2 } from 'lucide-react'

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
  onClear: () => void
  onSave: () => void
}

export function CanvasToolbar({
  projectName,
  nodeCount,
  saving = false,
  onClear,
  onSave,
}: CanvasToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const empty = nodeCount === 0

  return (
    <Panel position="top-left" className="!m-3">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur-md">
        <span className="px-2 text-xs">
          <span className="text-muted-foreground">Proyecto:</span>{' '}
          <span className="font-mono font-medium text-foreground">{projectName}</span>
        </span>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

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

        <Button variant="ghost" size="sm" disabled={empty} onClick={() => setConfirmOpen(true)}>
          <Trash2 />
          Limpiar
        </Button>
        <Button variant="cta" size="sm" disabled={empty} loading={saving} onClick={onSave}>
          <Save />
          Guardar
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
