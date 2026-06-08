import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

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
  /** 'destructive' (rojo, por defecto) o 'default' (acento de marca, acción no destructiva). */
  tone?: 'destructive' | 'default'
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
  tone = 'destructive',
  onConfirm,
}: ConfirmDialogProps) {
  const [isWorking, setIsWorking] = useState(false)
  const isDestructive = tone === 'destructive'

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
          <div
            className={cn(
              'mb-2 flex size-11 items-center justify-center rounded-xl border',
              isDestructive
                ? 'border-destructive/25 bg-destructive/10 text-destructive'
                : 'border-primary/25 bg-primary/10 text-primary'
            )}
          >
            {isDestructive ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" disabled={isWorking} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? 'destructive' : 'cta'}
            disabled={isWorking}
            onClick={() => void handleConfirm()}
          >
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
