import type { ChangeEvent, FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DatasetPanelProps {
  datasetPath: string | null
  datasetFile: File | null
  isUploading: boolean
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onDelete: () => Promise<void>
}

export function DatasetPanel({ datasetPath, datasetFile, isUploading, onFileChange, onSubmit, onDelete }: DatasetPanelProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Este proyecto mantiene su propio `datasetPath`, aislado del resto de workspaces del usuario.
      </p>
      <p className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-300">
        {datasetPath ?? 'No dataset uploaded yet.'}
      </p>
      <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
        <Input type="file" onChange={onFileChange} accept=".csv,.png,.jpg,.jpeg" />
        <div className="flex gap-2">
          <Button type="submit" disabled={isUploading || !datasetFile}>
            {isUploading ? 'Uploading...' : 'Upload Dataset'}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void onDelete()} disabled={!datasetPath}>
            Remove Dataset
          </Button>
        </div>
      </form>
    </div>
  )
}
