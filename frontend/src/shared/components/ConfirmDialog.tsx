import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => Promise<void> | void
}

/**
 * Confirmación explícita para acciones destructivas (RN-007).
 * Patrón AlertDialog reutilizable: la acción solo se ejecuta tras confirmar;
 * cerrar o "Cancelar" la aborta.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  onConfirm,
}: ConfirmDialogProps) {
  const [isWorking, setIsWorking] = useState(false)

  const handleConfirm = async () => {
    setIsWorking(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isWorking && onOpenChange(next)}>
      <DialogContent showCloseButton={!isWorking} className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" disabled={isWorking} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" disabled={isWorking} onClick={() => void handleConfirm()}>
            {isWorking ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Procesando…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
