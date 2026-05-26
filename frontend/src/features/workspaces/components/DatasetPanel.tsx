import { useState, type ChangeEvent, type FormEvent } from 'react'
import { CheckCircle, Database, Link, Upload } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { API_BASE_URL } from '@/shared/api/env'

type DatasetMode = 'keras' | 'url' | 'file'

const KERAS_DATASETS = [
  { value: 'mnist', label: 'MNIST — Handwritten Digits (60k)' },
  { value: 'fashion_mnist', label: 'Fashion MNIST — Clothing (60k)' },
  { value: 'cifar10', label: 'CIFAR-10 — Objects 10 classes (50k)' },
  { value: 'cifar100', label: 'CIFAR-100 — Objects 100 classes (50k)' },
]

interface DatasetPanelProps {
  datasetPath: string | null
  datasetFile: File | null
  isUploading: boolean
  workspaceId: number | null
  token: string
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onDelete: () => Promise<void>
  onUrlDownload: (url: string) => Promise<void>
}

export function DatasetPanel({
  datasetPath,
  datasetFile,
  isUploading,
  workspaceId,
  token,
  onFileChange,
  onSubmit,
  onDelete,
  onUrlDownload,
}: DatasetPanelProps) {
  const [mode, setMode] = useState<DatasetMode>('keras')
  const [kerasSelected, setKeras] = useState('mnist')
  const [urlValue, setUrl] = useState('')
  const [isDownloading, setDownloading] = useState(false)

  const filename = datasetPath ? datasetPath.split(/[/\\]/).pop() ?? '' : ''
  const viewUrl = datasetPath && workspaceId && !datasetPath.startsWith('keras://')
    ? `${API_BASE_URL}/workspaces/${workspaceId}/dataset/${filename}`
    : null

  const handleKerasSubmit = async () => {
    setDownloading(true)
    try {
      await onUrlDownload(`__keras__${kerasSelected}`)
    } finally {
      setDownloading(false)
    }
  }

  const handleUrlSubmit = async () => {
    const trimmed = urlValue.trim()
    if (!trimmed) return
    setDownloading(true)
    try {
      await onUrlDownload(trimmed)
      setUrl('')
    } finally {
      setDownloading(false)
    }
  }

  const tabs: { key: DatasetMode; label: string; Icon: typeof Database }[] = [
    { key: 'keras', label: 'Keras Built-in', Icon: Database },
    { key: 'url', label: 'HTTP URL', Icon: Link },
    { key: 'file', label: 'Archivo', Icon: Upload },
  ]

  return (
    <div className="space-y-5">
      {datasetPath ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-400">
              Dataset activo
            </p>
            <p className="break-all font-mono text-xs text-slate-300">{datasetPath}</p>
            <div className="mt-2 flex gap-3">
              {viewUrl && (
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(viewUrl, {
                        headers: { Authorization: `Bearer ${token}` },
                      })
                      const blob = await response.blob()
                      window.open(URL.createObjectURL(blob), '_blank')
                    } catch {
                      window.open(viewUrl, '_blank')
                    }
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Ver archivo
                </button>
              )}
              <button
                onClick={() => void onDelete()}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-400">
          Sin dataset — selecciona uno de los métodos abajo.
        </p>
      )}

      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/35">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium transition-colors ${
              mode === key
                ? 'bg-blue-600 text-white'
                : 'border-l border-slate-800/80 text-slate-400 first:border-l-0 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {mode === 'keras' && (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-400">
            Datasets de Keras cargados directamente en el motor al entrenar. No requieren descarga previa.
          </p>
          <select
            value={kerasSelected}
            onChange={(event) => setKeras(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-700/80 bg-slate-950/40 px-3 text-sm font-medium text-slate-100 outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/15"
          >
            {KERAS_DATASETS.map((dataset) => (
              <option key={dataset.value} value={dataset.value}>{dataset.label}</option>
            ))}
          </select>
          <Button
            type="button"
            onClick={() => void handleKerasSubmit()}
            disabled={isDownloading}
            className="h-11 w-full bg-blue-600 text-white hover:bg-blue-500"
          >
            {isDownloading ? 'Registrando...' : `Usar ${kerasSelected.toUpperCase()}`}
          </Button>
        </div>
      )}

      {mode === 'url' && (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-400">
            URL directa a un archivo .zip, .png, .jpg o repositorio GitHub.
          </p>
          <Input
            type="text"
            value={urlValue}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/user/repo o https://ejemplo.com/data.zip"
            className="h-11 rounded-xl border-slate-700/80 bg-slate-950/40 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500/20"
          />
          <Button
            type="button"
            onClick={() => void handleUrlSubmit()}
            disabled={isDownloading || !urlValue.trim()}
            className="h-10 w-full bg-blue-600 text-white hover:bg-blue-500"
          >
            {isDownloading ? 'Descargando...' : 'Descargar dataset'}
          </Button>
        </div>
      )}

      {mode === 'file' && (
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <p className="text-sm leading-6 text-slate-400">
            Sube un archivo .zip de imágenes desde tu equipo.
          </p>
          <Input
            type="file"
            onChange={onFileChange}
            accept=".png,.jpg,.jpeg,.zip"
            className="h-11 rounded-xl border-slate-700/80 bg-slate-950/40 text-xs text-slate-100 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-xs file:text-slate-200"
          />
          <Button
            type="submit"
            disabled={isUploading || !datasetFile}
            className="h-10 w-full bg-blue-600 text-white hover:bg-blue-500"
          >
            {isUploading ? 'Subiendo...' : datasetPath ? 'Reemplazar dataset' : 'Subir dataset'}
          </Button>
        </form>
      )}
    </div>
  )
}
