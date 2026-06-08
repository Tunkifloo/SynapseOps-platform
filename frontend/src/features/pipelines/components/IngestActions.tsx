import { useState, type ChangeEvent } from 'react'
import { UploadCloud } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { notify } from '@/shared/notify'
import {
  registerKerasDataset,
  uploadDataset,
  uploadDatasetFromUrl,
} from '@/features/workspaces/api'

const ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.zip']

interface IngestActionsProps {
  token: string
  workspaceId: number
  mode: string
  kerasDataset?: string
  url?: string
  onAssigned: (descriptor: string) => void
}

/**
 * Acción funcional del nodo de Ingesta (HU-002): asigna el dataset al workspace
 * según el modo configurado (built-in keras / URL / subir .zip|imagen).
 */
export function IngestActions({
  token,
  workspaceId,
  mode,
  kerasDataset,
  url,
  onAssigned,
}: IngestActionsProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null
    if (selected) {
      const ext = `.${selected.name.split('.').pop()?.toLowerCase() ?? ''}`
      if (!ALLOWED_EXTS.includes(ext)) {
        notify.error('Formato no permitido', {
          description: 'Solo se aceptan .png, .jpg, .jpeg o .zip.',
        })
        e.target.value = ''
        setFile(null)
        return
      }
    }
    setFile(selected)
  }

  const apply = async () => {
    setLoading(true)
    try {
      let descriptor: string
      if (mode === 'keras') {
        if (!kerasDataset) throw new Error('Selecciona un dataset built-in.')
        await registerKerasDataset(token, workspaceId, kerasDataset)
        descriptor = kerasDataset
      } else if (mode === 'url') {
        if (!url?.trim()) throw new Error('Ingresa una URL válida.')
        await uploadDatasetFromUrl(token, workspaceId, url.trim())
        descriptor = 'URL'
      } else {
        if (!file) throw new Error('Selecciona un archivo .png/.jpg/.jpeg/.zip.')
        await uploadDataset(token, workspaceId, file)
        descriptor = file.name
      }
      notify.success('Dataset asignado', { description: 'El nodo de ingesta quedó listo.' })
      onAssigned(descriptor)
    } catch (err) {
      notify.error('No se pudo asignar el dataset', {
        description: err instanceof Error ? err.message : 'Intenta nuevamente.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        Asignar dataset
      </p>

      {mode === 'zip' && (
        <Input
          type="file"
          accept=".png,.jpg,.jpeg,.zip"
          onChange={onFileChange}
          aria-label="Archivo de dataset (.png, .jpg, .jpeg o .zip)"
        />
      )}
      {mode === 'keras' && (
        <p className="text-xs text-muted-foreground">
          Se registrará el dataset built-in <span className="font-mono">{kerasDataset || '—'}</span>.
        </p>
      )}
      {mode === 'url' && (
        <p className="truncate text-xs text-muted-foreground">
          Se descargará desde: <span className="font-mono">{url || '—'}</span>
        </p>
      )}

      <Button variant="cta" size="sm" className="w-full" loading={loading} onClick={() => void apply()}>
        <UploadCloud />
        Asignar al workspace
      </Button>
    </div>
  )
}
