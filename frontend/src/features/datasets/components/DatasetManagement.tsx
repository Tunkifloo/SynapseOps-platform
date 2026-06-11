import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { CheckCircle, Database, GitBranch, Link, Trash2, Upload, Eye, FileArchive } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Spinner } from '@/shared/components/ui/spinner'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet'
import { notify } from '@/shared/notify'
import { API_BASE_URL } from '@/shared/api/env'
import {
  deleteDataset,
  listMyWorkspaces,
  listWorkspacePipelines,
  uploadDataset,
  uploadDatasetFromUrl,
} from '@/features/workspaces/api'
import { extractFilename, type WorkspaceSummary } from '@/features/workspaces/types'

interface DatasetManagementProps {
  token: string
}

const KERAS_DATASETS = [
  { value: 'mnist', label: 'MNIST — Handwritten Digits (60k)' },
  { value: 'fashion_mnist', label: 'Fashion MNIST — Clothing (60k)' },
]

type ReplaceMode = 'file' | 'url' | 'keras'

function datasetType(path: string): string {
  if (path.startsWith('keras://')) return 'keras'
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'zip') return 'zip'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'imagen'
  return ext || 'desconocido'
}

function datasetIcon(type: string) {
  if (type === 'keras') return Database
  if (type === 'zip') return FileArchive
  return Eye
}

export function DatasetManagement({ token }: DatasetManagementProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [pipelineCounts, setPipelineCounts] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [selectedWs, setSelectedWs] = useState<WorkspaceSummary | null>(null)

  const [replaceMode, setReplaceMode] = useState<ReplaceMode>('file')
  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const [replaceUrl, setReplaceUrl] = useState('')
  const [replaceKeras, setReplaceKeras] = useState('mnist')
  const [isReplacing, setIsReplacing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      const counts: Record<number, number> = {}
      await Promise.all(
        data.map(async (w) => {
          try {
            const pipes = await listWorkspacePipelines(token, w.idWorkspace)
            counts[w.idWorkspace] = pipes.length
          } catch { counts[w.idWorkspace] = 0 }
        })
      )
      setPipelineCounts(counts)
    } catch { /* handled by interceptor */ }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { void load() }, [load])

  const withDataset = useMemo(() => workspaces.filter((w) => !!w.datasetPath), [workspaces])
  const withoutDataset = useMemo(() => workspaces.filter((w) => !w.datasetPath), [workspaces])

  const handleDelete = async (ws: WorkspaceSummary) => {
    if (!ws.datasetPath) return
    setIsDeleting(true)
    try {
      await deleteDataset(token, ws.idWorkspace, extractFilename(ws.datasetPath))
      notify.success('Dataset eliminado', { description: `Workspace: ${ws.name}` })
      await load()
    } catch {
      notify.error('Error al eliminar')
    } finally { setIsDeleting(false) }
  }

  const handleReplace = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedWs) return
    setIsReplacing(true)
    try {
      if (replaceMode === 'file' && replaceFile) {
        await uploadDataset(token, selectedWs.idWorkspace, replaceFile)
      } else if (replaceMode === 'url' && replaceUrl.trim()) {
        await uploadDatasetFromUrl(token, selectedWs.idWorkspace, replaceUrl.trim())
      } else if (replaceMode === 'keras') {
        await uploadDatasetFromUrl(token, selectedWs.idWorkspace, `__keras__${replaceKeras}`)
      }
      notify.success('Dataset actualizado', { description: `Workspace: ${selectedWs.name}` })
      setSelectedWs(null)
      await load()
    } catch {
      notify.error('Error al reemplazar')
    } finally { setIsReplacing(false) }
  }

  const openSheet = (ws: WorkspaceSummary) => {
    setSelectedWs(ws)
    setReplaceMode('file')
    setReplaceFile(null)
    setReplaceUrl('')
    setReplaceKeras('mnist')
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setReplaceFile(e.target.files?.[0] ?? null)
  }

  const storageUsed = withDataset.length
  const storageTotal = workspaces.length
  const maxMb = Number(import.meta.env.VITE_STORAGE_MAX_FILE_SIZE_MB) || 500
  const storagePercent = storageTotal > 0 ? Math.round((storageUsed / storageTotal) * 100) : 0
  const totalPipelines = Object.values(pipelineCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-5">
      {/* Storage summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="flex items-center gap-3 py-4">
            <Database className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Con dataset</p>
              <p className="text-xl font-bold">{storageUsed} / {storageTotal}</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3 py-4">
            <GitBranch className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Pipelines totales</p>
              <p className="text-xl font-bold">{totalPipelines}</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3 py-4">
            <FileArchive className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Límite por archivo</p>
              <p className="text-xl font-bold">{maxMb} MB</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Ocupación</p>
            <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{storagePercent}% asignados</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Cargando datasets…
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
              <Database className="mb-3 size-9 text-muted-foreground/50" />
              <p className="text-base font-semibold text-foreground">Sin proyectos</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Crea un proyecto en Mis proyectos para asignarle un dataset.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    <th className="px-5 py-3">Proyecto</th>
                    <th className="px-3 py-3">Pipelines</th>
                    <th className="px-3 py-3">Dataset</th>
                    <th className="px-3 py-3">Tipo</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {[...withDataset, ...withoutDataset].map((ws) => {
                    const hasDs = !!ws.datasetPath
                    const fname = hasDs ? extractFilename(ws.datasetPath!) : '—'
                    const dtype = hasDs ? datasetType(ws.datasetPath!) : '—'
                    const DIcon = hasDs ? datasetIcon(dtype) : Database

                    return (
                      <tr
                        key={ws.idWorkspace}
                        className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                              <DIcon className="size-4" />
                            </div>
                            <span className="truncate font-semibold text-foreground">{ws.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="info">{pipelineCounts[ws.idWorkspace] ?? '…'}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <span className="truncate font-mono text-xs text-muted-foreground" title={ws.datasetPath ?? ''}>
                            {fname}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={hasDs ? 'info' : 'secondary'}>
                            {dtype}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={hasDs ? 'success' : 'secondary'}>
                            {hasDs ? 'Asignado' : 'Sin dataset'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {hasDs && (
                              <>
                                <Button
                                  variant="ghost" size="icon-sm"
                                  aria-label="Ver dataset"
                                  title="Ver"
                                  onClick={async () => {
                                    const filename = extractFilename(ws.datasetPath!)
                                    const url = `${API_BASE_URL}/workspaces/${ws.idWorkspace}/dataset/${filename}`
                                    try {
                                      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                                      const blob = await r.blob()
                                      window.open(URL.createObjectURL(blob), '_blank')
                                    } catch { window.open(url, '_blank') }
                                  }}
                                >
                                  <Eye className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon-sm"
                                  aria-label="Eliminar dataset"
                                  title="Eliminar"
                                  disabled={isDeleting}
                                  onClick={() => void handleDelete(ws)}
                                >
                                  <Trash2 className="size-3.5 text-destructive" />
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openSheet(ws)}>
                              {hasDs ? 'Reemplazar' : 'Asignar'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheet: Replace/Assign dataset */}
      <Sheet open={selectedWs != null} onOpenChange={(open) => !open && setSelectedWs(null)}>
        <SheetContent className="max-w-md">
          <SheetHeader>
            <SheetTitle className="truncate pr-8">
              {selectedWs?.datasetPath ? 'Reemplazar dataset' : 'Asignar dataset'}
            </SheetTitle>
            <p className="text-sm text-muted-foreground truncate">
              {selectedWs?.name}
            </p>
          </SheetHeader>
          <SheetBody>
            {selectedWs?.datasetPath && (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 mb-4">
                <CheckCircle className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 mb-1">
                    Dataset activo
                  </p>
                  <p className="text-xs text-slate-300 break-all font-mono">{selectedWs.datasetPath}</p>
                </div>
              </div>
            )}

            <form onSubmit={(e) => void handleReplace(e)} className="space-y-4">
              <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1">
                {([
                  { key: 'file' as ReplaceMode, label: 'Archivo', icon: Upload },
                  { key: 'url' as ReplaceMode, label: 'URL', icon: Link },
                  { key: 'keras' as ReplaceMode, label: 'Keras', icon: Database },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReplaceMode(key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-medium transition-all ${
                      replaceMode === key
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Icon className="size-3" />
                    {label}
                  </button>
                ))}
              </div>

              {replaceMode === 'file' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Sube un archivo .zip de imágenes (.png/.jpg/.jpeg/.zip).
                  </p>
                  <Input
                    type="file"
                    onChange={onFileChange}
                    accept=".png,.jpg,.jpeg,.zip"
                    className="border-white/10 bg-white/5 text-xs file:text-xs file:text-slate-300 file:bg-white/10 file:border-0 file:rounded-lg file:px-3 file:py-1"
                  />
                </div>
              )}

              {replaceMode === 'url' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    URL a un .zip, imagen o repositorio GitHub (.git).
                  </p>
                  <Input
                    type="text"
                    value={replaceUrl}
                    onChange={(e) => setReplaceUrl(e.target.value)}
                    placeholder="https://github.com/usuario/repo.git"
                    className="bg-white/[0.04] border-white/10 text-white text-xs"
                  />
                </div>
              )}

              {replaceMode === 'keras' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Dataset built-in de Keras. Se carga directamente en el ml-engine al entrenar.
                  </p>
                  <select
                    value={replaceKeras}
                    onChange={(e) => setReplaceKeras(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {KERAS_DATASETS.map((ds) => (
                      <option key={ds.value} value={ds.value}>{ds.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                type="submit"
                disabled={isReplacing || (replaceMode === 'file' && !replaceFile) || (replaceMode === 'url' && !replaceUrl.trim())}
                variant="cta"
                className="w-full"
              >
                {isReplacing ? 'Procesando…' : selectedWs?.datasetPath ? 'Reemplazar dataset' : 'Asignar dataset'}
              </Button>
            </form>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}
