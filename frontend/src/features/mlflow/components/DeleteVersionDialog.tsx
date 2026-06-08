import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'

interface DeleteVersionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelName: string
  version: string
  onConfirm: () => Promise<void>
}

/**
 * Confirmación destructiva (patrón AlertDialog) para eliminar una versión del
 * Model Registry. MLflow es la única fuente de verdad: al confirmar se elimina
 * la versión y, best-effort, el run con sus artefactos.
 */
export function DeleteVersionDialog({
  open,
  onOpenChange,
  modelName,
  version,
  onConfirm,
}: DeleteVersionDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isDeleting && onOpenChange(next)}>
      <DialogContent showCloseButton={!isDeleting} className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-destructive/25 bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle>Eliminar versión del modelo</DialogTitle>
          <DialogDescription>
            Vas a eliminar{' '}
            <span className="font-mono font-semibold text-foreground">
              {modelName} · v{version}
            </span>{' '}
            del Model Registry. Esta acción también elimina el run y sus
            artefactos en MLflow y <span className="font-semibold text-foreground">no se puede deshacer</span>.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={() => void handleConfirm()}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Eliminando…
              </>
            ) : (
              <>
                <Trash2 className="mr-2 size-4" />
                Eliminar versión
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
