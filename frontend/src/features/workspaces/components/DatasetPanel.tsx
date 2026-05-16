import { useState, type ChangeEvent, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { API_BASE_URL } from '@/shared/api/env'

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
  const [repoUrl, setRepoUrl] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const filename = datasetPath ? datasetPath.split(/[/\\]/).pop() ?? '' : ''
  const viewUrl = datasetPath && workspaceId
    ? `${API_BASE_URL}/workspaces/${workspaceId}/dataset/${filename}`
    : null

  const handleView = async () => {
    if (!viewUrl) return
    try {
      const response = await fetch(viewUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      window.open(URL.createObjectURL(blob), '_blank')
    } catch {
      window.open(viewUrl, '_blank')
    }
  }

  const handleUrlSubmit = async () => {
    const trimmed = repoUrl.trim()
    if (!trimmed) return
    setIsDownloading(true)
    try {
      await onUrlDownload(trimmed)
      setRepoUrl('')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Solo se aceptan datasets de imágenes (.png, .jpg, .jpeg) o archivos comprimidos (.zip).
      </p>

      {datasetPath ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-xs text-emerald-400 mb-1">Dataset activo</p>
          <p className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-300 break-all">
            {datasetPath}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleView}>
              View
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void onDelete()}>
              Remove Dataset
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-500">
          No dataset uploaded yet.
        </div>
      )}

      <div className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
        <p className="text-xs font-semibold text-white">
          {datasetPath ? 'Reemplazar dataset' : 'Subir dataset'}
        </p>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => void onSubmit(event)}>
          <Input
            type="file"
            onChange={onFileChange}
            accept=".png,.jpg,.jpeg,.zip"
            className="border-white/10 bg-white/5 text-xs"
          />
          <Button type="submit" disabled={isUploading || !datasetFile} size="sm">
            {isUploading ? 'Uploading...' : datasetPath ? 'Replace' : 'Upload'}
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
        <p className="text-xs font-semibold text-white">Descargar desde URL</p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="text"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="https://ejemplo.com/dataset.zip"
            className="border-white/10 bg-white/5 text-xs flex-1 min-w-[200px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleUrlSubmit()}
            disabled={isDownloading || !repoUrl.trim()}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  )
}
