import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Database, Link, Upload, CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { API_BASE_URL } from '@/shared/api/env'

type DatasetMode = 'keras' | 'url' | 'file'

const KERAS_DATASETS = [
  { value: 'mnist',        label: 'MNIST — Handwritten Digits (60k)' },
  { value: 'fashion_mnist', label: 'Fashion MNIST — Clothing (60k)' },
  { value: 'cifar10',      label: 'CIFAR-10 — Objects 10 classes (50k)' },
  { value: 'cifar100',     label: 'CIFAR-100 — Objects 100 classes (50k)' },
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
  const [mode, setMode]               = useState<DatasetMode>('keras')
  const [kerasSelected, setKeras]     = useState('mnist')
  const [urlValue, setUrl]            = useState('')
  const [isDownloading, setDownloading] = useState(false)

  const filename = datasetPath ? datasetPath.split(/[/\\]/).pop() ?? '' : ''
  const viewUrl  = datasetPath && workspaceId && !datasetPath.startsWith('keras://')
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
    { key: 'url',   label: 'HTTP URL',        Icon: Link     },
    { key: 'file',  label: 'File Upload',     Icon: Upload   },
  ]

  return (
      <div className="space-y-4">

        {/* Dataset activo */}
        {datasetPath ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <CheckCircle size={15} className="text-emerald-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-1">
                  Dataset activo
                </p>
                <p className="text-xs text-slate-300 break-all font-mono">{datasetPath}</p>
                <div className="mt-2 flex gap-2">
                  {viewUrl && (
                      <button
                          onClick={async () => {
                            try {
                              const r = await fetch(viewUrl, {
                                headers: { Authorization: `Bearer ${token}` },
                              })
                              const blob = await r.blob()
                              window.open(URL.createObjectURL(blob), '_blank')
                            } catch { window.open(viewUrl, '_blank') }
                          }}
                          className="text-[10px] text-slate-400 underline underline-offset-2 hover:text-white"
                      >
                        Ver archivo
                      </button>
                  )}
                  <button
                      onClick={() => void onDelete()}
                      className="text-[10px] text-red-400 underline underline-offset-2 hover:text-red-300"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
        ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-[11px] text-slate-600">
              Sin dataset — selecciona uno de los métodos abajo.
            </div>
        )}

        {/* Tabs de tipo */}
        <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1">
          {tabs.map(({ key, label, Icon }) => (
              <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-medium transition-all ${
                      mode === key
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                <Icon size={11} />
                {label}
              </button>
          ))}
        </div>

        {/* Keras Built-in */}
        {mode === 'keras' && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500">
                Datasets de Keras cargados directamente en el ml-engine al entrenar. No requieren descarga previa.
              </p>
              <select
                  value={kerasSelected}
                  onChange={(e) => setKeras(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {KERAS_DATASETS.map((ds) => (
                    <option key={ds.value} value={ds.value}>{ds.label}</option>
                ))}
              </select>
              <Button
                  type="button"
                  onClick={() => void handleKerasSubmit()}
                  disabled={isDownloading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isDownloading ? 'Registrando...' : `Usar ${kerasSelected.toUpperCase()}`}
              </Button>
            </div>
        )}

        {/* HTTP URL */}
        {mode === 'url' && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500">
                URL directa a un archivo .zip, .png, .jpg o repositorio GitHub.
              </p>
              <Input
                  type="text"
                  value={urlValue}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/user/repo o https://ejemplo.com/data.zip"
                  className="bg-white/[0.04] border-white/10 text-white text-xs"
              />
              <Button
                  type="button"
                  onClick={() => void handleUrlSubmit()}
                  disabled={isDownloading || !urlValue.trim()}
                  className="w-full"
              >
                {isDownloading ? 'Descargando...' : 'Descargar dataset'}
              </Button>
            </div>
        )}

        {/* File Upload */}
        {mode === 'file' && (
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
              <p className="text-[11px] text-slate-500">
                Sube un archivo .zip de imágenes desde tu equipo.
              </p>
              <Input
                  type="file"
                  onChange={onFileChange}
                  accept=".png,.jpg,.jpeg,.zip"
                  className="border-white/10 bg-white/5 text-xs file:text-xs file:text-slate-300 file:bg-white/10 file:border-0 file:rounded-lg file:px-3 file:py-1"
              />
              <Button
                  type="submit"
                  disabled={isUploading || !datasetFile}
                  className="w-full"
              >
                {isUploading ? 'Subiendo...' : datasetPath ? 'Reemplazar dataset' : 'Subir dataset'}
              </Button>
            </form>
        )}
      </div>
  )
}