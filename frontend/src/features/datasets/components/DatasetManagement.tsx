import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { CheckCircle, Database, GitBranch, Link, Trash2, Upload, Eye, Download, FileArchive, HardDrive } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Spinner } from '@/shared/components/ui/spinner'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet'
import { notify } from '@/shared/notify'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { DataTable, type DataColumn } from '@/shared/components/DataTable'
import { EmptyState } from '@/shared/components/EmptyState'
import { API_BASE_URL } from '@/shared/api/env'
import {
  deleteDataset,
  getStorageUsage,
  listMyWorkspaces,
  listWorkspacePipelines,
  uploadDataset,
  uploadDatasetFromUrl,
  type StorageUsage,
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
  const [maxMb, setMaxMb] = useState(500)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void | Promise<void>
  } | null>(null)

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
      // Uso de disco real + límites (fuente única del backend). Se refresca con cada
      // load() → tras subir/eliminar dataset el espacio mostrado queda al día.
      try {
        const u = await getStorageUsage(token)
        setUsage(u)
        setMaxMb(u.maxFileSizeMb)
      } catch { /* mantiene los defaults seguros */ }
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

  const doReplace = async (ws: WorkspaceSummary) => {
    setIsReplacing(true)
    try {
      if (replaceMode === 'file' && replaceFile) {
        await uploadDataset(token, ws.idWorkspace, replaceFile)
      } else if (replaceMode === 'url' && replaceUrl.trim()) {
        await uploadDatasetFromUrl(token, ws.idWorkspace, replaceUrl.trim())
      } else if (replaceMode === 'keras') {
        await uploadDatasetFromUrl(token, ws.idWorkspace, `__keras__${replaceKeras}`)
      }
      notify.success('Dataset actualizado', { description: `Workspace: ${ws.name}` })
      setSelectedWs(null)
      await load()
    } catch {
      notify.error('Error al reemplazar')
    } finally { setIsReplacing(false) }
  }

  const handleReplace = (e: FormEvent) => {
    e.preventDefault()
    if (!selectedWs) return
    const ws = selectedWs
    // Reemplazar un dataset existente es destructivo (borra el anterior + sus artefactos
    // intermedios) → confirmación. Asignar por primera vez no la requiere.
    if (ws.datasetPath) {
      setConfirm({
        title: 'Reemplazar dataset',
        description: `Se reemplazará el dataset de «${ws.name}». El dataset anterior y sus `
          + 'artefactos intermedios (extracted) se eliminarán. Esta acción no se puede deshacer.',
        confirmLabel: 'Reemplazar',
        onConfirm: () => doReplace(ws),
      })
    } else {
      void doReplace(ws)
    }
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

  // Descarga real del dataset (antes el ícono "ver" abría una pestaña). Spinner por fila
  // + toasts de progreso/resultado (UX).
  const handleDownload = async (ws: WorkspaceSummary) => {
    if (!ws.datasetPath) return
    const filename = extractFilename(ws.datasetPath)
    setDownloadingId(ws.idWorkspace)
    notify.info('Descargando dataset…', { description: filename })
    try {
      const res = await fetch(
        `${API_BASE_URL}/workspaces/${ws.idWorkspace}/dataset/${filename}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      notify.success('Descarga lista', { description: filename })
    } catch {
      notify.error('No se pudo descargar el dataset')
    } finally {
      setDownloadingId(null)
    }
  }

  const storageUsed = withDataset.length
  const storageTotal = workspaces.length
  const totalPipelines = Object.values(pipelineCounts).reduce((a, b) => a + b, 0)

  // Uso de disco real (UX de almacenamiento): cuánto ocupa cada proyecto vs su cuota.
  const quotaMb = usage?.maxWorkspaceMb ?? 2000
  const toMb = (bytes: number) => Math.round(bytes / (1024 * 1024))
  const usageByWs = useMemo(
    () => new Map((usage?.workspaces ?? []).map((w) => [w.workspaceId, w.usedBytes])),
    [usage],
  )
  const usedTotalMb = usage ? toMb(usage.totalUsedBytes) : 0
  const budgetTotalMb = quotaMb * Math.max(storageTotal, 1)
  const usedPercent = budgetTotalMb > 0 ? Math.min(100, Math.round((usedTotalMb / budgetTotalMb) * 100)) : 0

  // Columnas de la tabla de datasets (DataTable compartido).
  const datasetColumns: DataColumn<WorkspaceSummary>[] = [
    {
      key: 'project', header: 'Proyecto', headerClassName: 'px-5', className: 'px-5',
      render: (ws) => {
        const dtype = ws.datasetPath ? datasetType(ws.datasetPath) : '—'
        const DIcon = ws.datasetPath ? datasetIcon(dtype) : Database
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <DIcon className="size-4" />
            </span>
            <span className="truncate font-semibold text-foreground">{ws.name}</span>
          </div>
        )
      },
    },
    { key: 'pipelines', header: 'Pipelines', render: (ws) => <Badge variant="info">{pipelineCounts[ws.idWorkspace] ?? '…'}</Badge> },
    {
      key: 'dataset', header: 'Dataset',
      render: (ws) => (
        <span className="truncate font-mono text-xs text-muted-foreground" title={ws.datasetPath ?? ''}>
          {ws.datasetPath ? extractFilename(ws.datasetPath) : '—'}
        </span>
      ),
    },
    {
      key: 'type', header: 'Tipo',
      render: (ws) => {
        const has = !!ws.datasetPath
        return <Badge variant={has ? 'info' : 'secondary'}>{has ? datasetType(ws.datasetPath!) : '—'}</Badge>
      },
    },
    {
      key: 'usage', header: 'Uso',
      render: (ws) => {
        if (!ws.datasetPath) return <span className="text-xs text-muted-foreground">—</span>
        const usedWsMb = toMb(usageByWs.get(ws.idWorkspace) ?? 0)
        const wsPct = quotaMb > 0 ? Math.min(100, Math.round((usedWsMb / quotaMb) * 100)) : 0
        return (
          <div className="w-28" title={`${usedWsMb} MB de ${quotaMb} MB`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-foreground">{usedWsMb} MB</span>
              <span className="text-muted-foreground">{wsPct}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
              <div className={`h-full rounded-full ${wsPct >= 90 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${wsPct}%` }} />
            </div>
          </div>
        )
      },
    },
    { key: 'status', header: 'Estado', render: (ws) => <Badge variant={ws.datasetPath ? 'success' : 'secondary'}>{ws.datasetPath ? 'Asignado' : 'Sin dataset'}</Badge> },
    {
      key: 'actions', header: 'Acciones', headerClassName: 'px-5 text-right', className: 'px-5 text-right',
      render: (ws) => {
        const hasDs = !!ws.datasetPath
        return (
          <div className="flex items-center justify-end gap-1">
            {hasDs && (
              <>
                <Button
                  variant="ghost" size="icon-sm" aria-label="Descargar dataset" title="Descargar"
                  disabled={downloadingId === ws.idWorkspace} onClick={() => void handleDownload(ws)}
                >
                  {downloadingId === ws.idWorkspace ? <Spinner size="sm" /> : <Download className="size-3.5" />}
                </Button>
                <Button
                  variant="ghost" size="icon-sm" aria-label="Eliminar dataset" title="Eliminar" disabled={isDeleting}
                  onClick={() => setConfirm({
                    title: 'Eliminar dataset',
                    description: `Se eliminará el dataset de «${ws.name}» y sus artefactos intermedios. Esta acción no se puede deshacer.`,
                    confirmLabel: 'Eliminar',
                    onConfirm: () => handleDelete(ws),
                  })}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => openSheet(ws)}>{hasDs ? 'Reemplazar' : 'Asignar'}</Button>
          </div>
        )
      },
    },
  ]

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
              <p className="text-[11px] text-muted-foreground">Cuota {quotaMb} MB / proyecto</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-primary" />
              <p className="text-xs text-muted-foreground">Espacio usado</p>
            </div>
            <p className="mt-0.5 text-lg font-bold">
              {usedTotalMb} <span className="text-xs font-medium text-muted-foreground">/ {budgetTotalMb} MB</span>
            </p>
            <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${usedPercent >= 90 ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{usedPercent}% de tu cuota total</p>
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
            <EmptyState
              icon={Database}
              title="Sin proyectos"
              description="Crea un proyecto en Mis proyectos para asignarle un dataset."
              className="min-h-48"
            />
          ) : (
            <DataTable
              columns={datasetColumns}
              rows={[...withDataset, ...withoutDataset]}
              rowKey={(ws) => ws.idWorkspace}
              minWidth={680}
            />
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
                  <p className="text-xs text-muted-foreground break-all font-mono">{selectedWs.datasetPath}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleReplace} className="space-y-4">
              <div className="flex gap-1 rounded-xl border border-border bg-muted p-1">
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
                        ? 'bg-primary text-primary-foreground shadow'
                        : 'text-muted-foreground hover:text-foreground'
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
                    className="text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:text-foreground"
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
                    className="text-sm"
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
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.confirmLabel}
        tone="destructive"
        onConfirm={async () => { await confirm?.onConfirm() }}
      />
    </div>
  )
}
