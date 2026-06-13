import { useCallback, useRef, useState, type DragEvent } from 'react'
import { AlertTriangle, CheckCircle2, ImageUp, Info, Loader2, RotateCcw, Sparkles, Trash2, XCircle } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { isApiError } from '@/shared/api/client'
import { predictWithImage } from '../api'
import type { PredictResult } from '../types'

const MAX_FILES = 12
// Por debajo de esta confianza el modelo "no está seguro" → se ofrece reintentar.
const LOW_CONF = 0.6

/** Lee un File como base64 puro (sin el prefijo data-URL). */
const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })

interface PredItem {
  file: File
  url: string
  result?: PredictResult
  error?: string
  pending?: boolean
}

interface PredictModalProps {
  token: string
  executionId: number
  containerName: string
  modelVersion: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Modal de prueba del /predict del model-service: el usuario arrastra o elige imágenes,
 * las previsualiza, ve qué admite el servicio y obtiene la predicción de cada una.
 * El model-service procesa UNA imagen por petición → la lista se infiere secuencialmente.
 */
export function PredictModal({
  token, executionId, containerName, modelVersion, open, onOpenChange,
}: PredictModalProps) {
  const [items, setItems] = useState<PredItem[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setItems((prev) => {
      const room = Math.max(0, MAX_FILES - prev.length)
      const added = imgs.slice(0, room).map((f) => ({ file: f, url: URL.createObjectURL(f) }))
      return [...prev, ...added]
    })
  }, [])

  const removeAt = (idx: number) =>
    setItems((prev) => {
      URL.revokeObjectURL(prev[idx]?.url)
      return prev.filter((_, i) => i !== idx)
    })

  const clearAll = useCallback(() => {
    setItems((prev) => { prev.forEach((i) => URL.revokeObjectURL(i.url)); return [] })
  }, [])

  const close = (o: boolean) => {
    if (!o) { clearAll(); setBusy(false) }
    onOpenChange(o)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  // Infiere UNA imagen (reutilizable por el flujo principal y por "Reintentar").
  const predictOne = async (i: number) => {
    const file = items[i]?.file
    if (!file) return
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, pending: true, error: undefined, result: undefined } : it)))
    try {
      const b64 = await fileToBase64(file)
      const res = await predictWithImage(token, executionId, b64)
      setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, result: res, pending: false } : it)))
    } catch (err) {
      const msg = isApiError(err) ? err.message : err instanceof Error ? err.message : 'Error al predecir'
      setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, error: msg, pending: false } : it)))
    }
  }

  const runPredict = async () => {
    setBusy(true)
    for (let i = 0; i < items.length; i++) {
      if (items[i].result) continue   // no re-infiere los ya resueltos
      await predictOne(i)
    }
    setBusy(false)
  }

  const pendingCount = items.filter((i) => !i.result && !i.error).length

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Probar inferencia
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-foreground">{containerName}</span>
            {modelVersion ? ` · v${modelVersion}` : ''} — endpoint <span className="font-mono">/predict</span>
          </DialogDescription>
        </DialogHeader>

        {/* Guía de soporte del model-service */}
        <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <ul className="space-y-0.5">
            <li>Formatos: <span className="font-medium text-foreground">PNG, JPG o JPEG</span>.</li>
            <li>Cualquier dimensión: el servicio la <span className="font-medium text-foreground">redimensiona automáticamente</span> al tamaño con que se entrenó (p. ej. 64×64).</li>
            <li>Una imagen por predicción — puedes cargar varias (máx. {MAX_FILES}) y se infieren una a una.</li>
            <li>Para resultados fiables, usa imágenes parecidas a las del entrenamiento (mismo tipo de objeto/encuadre).</li>
          </ul>
        </div>

        {/* Zona de carga (drag & drop + clic) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150 ease-out-quart ${
            dragging ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/40'
          }`}
        >
          <ImageUp className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Arrastra imágenes o haz clic para elegir</p>
          <p className="text-[11px] text-muted-foreground">PNG · JPG · JPEG — hasta {MAX_FILES} imágenes</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        {/* Previsualización + resultados */}
        {items.length > 0 && (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {items.map((it, idx) => {
              const lowConf = !!it.result && it.result.confidence < LOW_CONF
              const canRetry = !it.pending && (!!it.error || lowConf)
              return (
              <div key={idx} className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-150">
                <img src={it.url} alt={it.file.name} className="size-12 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{it.file.name}</p>
                  {it.pending ? (
                    <p className="flex items-center gap-1 text-[11px] text-info-strong"><Loader2 className="size-3 animate-spin" /> Infiriendo…</p>
                  ) : it.error ? (
                    <p className="flex items-center gap-1 text-[11px] text-destructive-strong"><XCircle className="size-3" /> {it.error}</p>
                  ) : it.result ? (
                    lowConf ? (
                      <p className="flex items-center gap-1 text-[11px] text-warning-strong">
                        <AlertTriangle className="size-3" />
                        <span>Poco fiable:</span>
                        <span className="font-medium text-foreground">{it.result.class_name ?? `clase ${it.result.prediction}`}</span>
                        <span>· {(it.result.confidence * 100).toFixed(1)}%</span>
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-[11px] text-success-strong">
                        <CheckCircle2 className="size-3" />
                        <span className="font-medium text-foreground">{it.result.class_name ?? `clase ${it.result.prediction}`}</span>
                        <span className="text-muted-foreground">· {(it.result.confidence * 100).toFixed(1)}%</span>
                      </p>
                    )
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Listo para inferir</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canRetry && (
                    <button
                      type="button"
                      onClick={() => void predictOne(idx)}
                      className="rounded-md p-1 text-muted-foreground transition-colors duration-150 ease-out-quart hover:bg-primary/10 hover:text-primary"
                      aria-label="Reintentar predicción"
                      title="Reintentar"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    className="rounded-md p-1 text-muted-foreground transition-colors duration-150 ease-out-quart hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Quitar imagen"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={busy || items.length === 0}>
            Limpiar
          </Button>
          <Button variant="cta" size="sm" onClick={() => void runPredict()} disabled={busy || pendingCount === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? 'Infiriendo…' : pendingCount > 1 ? `Predecir ${pendingCount} imágenes` : 'Predecir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
