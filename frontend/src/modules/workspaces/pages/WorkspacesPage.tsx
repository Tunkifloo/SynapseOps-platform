import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Database as DatabaseIcon, ChevronRight } from 'lucide-react'
import { authorizedRequest } from '@/shared/api/client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  createPipeline, createWorkspace, deleteDataset, deletePipeline,
  deleteWorkspace, listMyWorkspaces, listWorkspacePipelines,
  renamePipeline, updateWorkspace, uploadDataset, uploadDatasetFromUrl,
} from '@/features/workspaces/api'
import { DatasetPanel }    from '@/features/workspaces/components/DatasetPanel'
import { PipelinesPanel }  from '@/features/workspaces/components/PipelinesPanel'
import { WorkspaceForm }   from '@/features/workspaces/components/WorkspaceForm'
import { ExecutionPanel }  from '@/features/executions/components/ExecutionPanel'
import {
  emptyPipelineForm, emptyWorkspaceForm, extractFilename,
  type PipelineFormData, type PipelineSummary,
  type WorkspaceFormData, type WorkspaceSummary,
} from '@/features/workspaces/types'
import { SectionTitle }  from '@/shared/components/SectionTitle'
import { useAppStore }   from '@/store/useAppStore'

function StatCard({ title, value }: { title: string; value: string }) {
  return (
      <Card className="bg-white/[0.03] border-white/5 backdrop-blur-xl hover:bg-white/[0.05] transition-all">
        <CardContent className="pt-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</div>
        </CardContent>
      </Card>
  )
}

interface WorkspacesPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

export function WorkspacesPage({ token, searchQuery, onAuthError }: WorkspacesPageProps) {
  const setWorkspace = useAppStore((state) => state.setWorkspace)

  // ── Estado ────────────────────────────────────────────────────────────────
  const [workspaces,          setWorkspaces]          = useState<WorkspaceSummary[]>([])
  const [pipelines,           setPipelines]           = useState<PipelineSummary[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null)
  const [workspaceForm,       setWorkspaceForm]       = useState<WorkspaceFormData>(emptyWorkspaceForm())
  const [pipelineForm,        setPipelineForm]        = useState<PipelineFormData>(emptyPipelineForm())
  const [editingWorkspaceId,  setEditingWorkspaceId]  = useState<number | null>(null)
  const [renamingPipelineId,  setRenamingPipelineId]  = useState<number | null>(null)
  const [renameValue,         setRenameValue]         = useState('')
  const [datasetFile,         setDatasetFile]         = useState<File | null>(null)
  const [showCreateForm,      setShowCreateForm]      = useState(false)
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true)
  const [isLoadingPipelines,  setIsLoadingPipelines]  = useState(false)
  const [isSavingWorkspace,   setIsSavingWorkspace]   = useState(false)
  const [isSavingPipeline,    setIsSavingPipeline]    = useState(false)
  const [isUploadingDataset,  setIsUploadingDataset]  = useState(false)
  const [error,               setError]               = useState<string | null>(null)
  const [notice,              setNotice]              = useState<string | null>(null)
  const [selectedPipelineForExec, setSelectedPipelineForExec] = useState<PipelineSummary | null>(null)

  const selectedWorkspace = workspaces.find((w) => w.idWorkspace === selectedWorkspaceId) ?? null

  const filteredWorkspaces = searchQuery
      ? workspaces.filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : workspaces

  // ── Cargar workspaces ─────────────────────────────────────────────────────
  const loadWorkspaces = useCallback(async (preferredId?: number | null) => {
    setIsLoadingWorkspaces(true)
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      if (data.length > 0) {
        const next = data.find((w) => w.idWorkspace === preferredId) ?? data[0]
        setSelectedWorkspaceId(next.idWorkspace)
        setWorkspace(next.name)
        setIsLoadingPipelines(true)
        listWorkspacePipelines(token, next.idWorkspace)
            .then((p) => { setPipelines(p); setError(null) })
            .catch((err) => { if (!onAuthError(err)) setError('Error cargando pipelines.') })
            .finally(() => setIsLoadingPipelines(false))
      } else {
        setSelectedWorkspaceId(null)
        setPipelines([])
        setWorkspace('Default Project')
      }
      setError(null)
    } catch (err) {
      if (!onAuthError(err)) setError('No se pudieron cargar tus proyectos.')
    } finally {
      setIsLoadingWorkspaces(false)
    }
  }, [token, onAuthError, setWorkspace])

  useEffect(() => { void loadWorkspaces() }, [loadWorkspaces])

  // ── Seleccionar workspace ─────────────────────────────────────────────────
  const selectWorkspace = useCallback((ws: WorkspaceSummary) => {
    setSelectedWorkspaceId(ws.idWorkspace)
    setWorkspace(ws.name)
    setSelectedPipelineForExec(null)   // limpiar ejecución al cambiar workspace
    setIsLoadingPipelines(true)
    listWorkspacePipelines(token, ws.idWorkspace)
        .then((p) => { setPipelines(p); setError(null) })
        .catch((err) => { if (!onAuthError(err)) setError('Error cargando pipelines.') })
        .finally(() => setIsLoadingPipelines(false))
  }, [token, onAuthError, setWorkspace])

  // ── Workspace CRUD ────────────────────────────────────────────────────────
  const handleSubmitWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSavingWorkspace(true)
    setNotice(null)
    try {
      const saved = editingWorkspaceId
          ? await updateWorkspace(token, editingWorkspaceId, workspaceForm)
          : await createWorkspace(token, workspaceForm)
      setNotice(editingWorkspaceId ? 'Workspace actualizado.' : 'Workspace creado.')
      setError(null)
      setWorkspaceForm(emptyWorkspaceForm())
      setEditingWorkspaceId(null)
      setShowCreateForm(false)
      setWorkspaces((prev) =>
          editingWorkspaceId
              ? prev.map((w) => w.idWorkspace === saved.idWorkspace ? saved : w)
              : [saved, ...prev],
      )
      selectWorkspace(saved)
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error guardando workspace.')
    } finally {
      setIsSavingWorkspace(false)
    }
  }

  const handleDeleteWorkspace = async (id: number) => {
    setNotice(null)
    try {
      await deleteWorkspace(token, id)
      setNotice('Workspace eliminado.')
      setError(null)
      if (selectedWorkspaceId === id) {
        setSelectedWorkspaceId(null)
        setPipelines([])
        setSelectedPipelineForExec(null)
      }
      const updated = await listMyWorkspaces(token)
      setWorkspaces(updated)
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error eliminando workspace.')
    }
  }

  // ── Dataset ───────────────────────────────────────────────────────────────
  const handleDatasetUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedWorkspaceId || !datasetFile) return
    setIsUploadingDataset(true)
    setNotice(null)
    try {
      await uploadDataset(token, selectedWorkspaceId, datasetFile)
      setDatasetFile(null)
      setError(null)
      setNotice('Dataset subido correctamente.')
      const updated = await listMyWorkspaces(token)
      setWorkspaces(updated)
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error subiendo dataset.')
    } finally {
      setIsUploadingDataset(false)
    }
  }

  const handleDeleteDataset = async () => {
    if (!selectedWorkspaceId || !selectedWorkspace?.datasetPath) return
    setNotice(null)
    try {
      const filename = extractFilename(selectedWorkspace.datasetPath)
      await deleteDataset(token, selectedWorkspaceId, filename)
      setError(null)
      setNotice('Dataset eliminado.')
      const updated = await listMyWorkspaces(token)
      setWorkspaces(updated)
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error eliminando dataset.')
    }
  }

  // ── CLAVE: distinguir keras vs URL ────────────────────────────────────────
  const handleUrlDownload = async (url: string) => {
    if (!selectedWorkspaceId) return
    setNotice(null)
    try {
      let message: string

      if (url.startsWith('__keras__')) {
        // Keras built-in — enviar { kerasDataset: "mnist" }
        const kerasDataset = url.replace('__keras__', '')
        const response = await authorizedRequest(
            `/workspaces/${selectedWorkspaceId}/dataset/url`,
            token,
            {
              method: 'POST',
              body: JSON.stringify({ kerasDataset }),
            },
        )
        message = await response.text()
      } else {
        // HTTP URL — enviar { url: "https://..." }
        message = await uploadDatasetFromUrl(token, selectedWorkspaceId, url)
      }

      setError(null)
      setNotice(message)
      const updated = await listMyWorkspaces(token)
      setWorkspaces(updated)
    } catch (err) {
      if (!onAuthError(err)) {
        setError(err instanceof Error ? err.message : 'Error descargando dataset.')
      }
    }
  }

  // ── Pipeline CRUD ─────────────────────────────────────────────────────────
  const handleCreatePipeline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedWorkspaceId) return
    setIsSavingPipeline(true)
    setNotice(null)
    try {
      const created = await createPipeline(token, selectedWorkspaceId, pipelineForm)
      setPipelineForm(emptyPipelineForm())
      setPipelines((prev) => [...prev, created])
      setError(null)
      setNotice('Pipeline creado.')
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error creando pipeline.')
    } finally {
      setIsSavingPipeline(false)
    }
  }

  const handleSaveRename = async (pipelineId: number) => {
    if (!selectedWorkspaceId || !renameValue.trim()) return
    setIsSavingPipeline(true)
    try {
      const updated = await renamePipeline(token, selectedWorkspaceId, pipelineId, renameValue.trim())
      setPipelines((prev) => prev.map((p) => p.idPipeline === pipelineId ? updated : p))
      setRenamingPipelineId(null)
      setRenameValue('')
      setNotice('Pipeline renombrado.')
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error renombrando pipeline.')
    } finally {
      setIsSavingPipeline(false)
    }
  }

  const handleDeletePipeline = async (pipelineId: number) => {
    if (!selectedWorkspaceId) return
    try {
      await deletePipeline(token, selectedWorkspaceId, pipelineId)
      setPipelines((prev) => prev.filter((p) => p.idPipeline !== pipelineId))
      if (selectedPipelineForExec?.idPipeline === pipelineId) {
        setSelectedPipelineForExec(null)
      }
      setNotice('Pipeline eliminado.')
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error eliminando pipeline.')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
      <div className="space-y-6">
        <SectionTitle
            eyebrow="HU-014"
            title="Workspace Project Management"
            description="Selecciona un proyecto para gestionar su dataset, pipelines y ejecutar entrenamientos."
        />

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard title="My Projects"       value={isLoadingWorkspaces ? '...' : String(workspaces.length)} />
          <StatCard title="Active Pipelines"  value={selectedWorkspaceId ? (isLoadingPipelines ? '...' : String(pipelines.length)) : '—'} />
          <StatCard title="Dataset"           value={selectedWorkspace?.datasetPath ? 'Attached ✓' : 'Pending'} />
        </div>

        {/* Notificaciones */}
        {(error ?? notice) && (
            <div className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'}`}>
              {error ?? notice}
            </div>
        )}

        {/* Layout master-detail */}
        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">

          {/* ── Columna izquierda: lista de workspaces ── */}
          <div className="space-y-4">
            {/* Botón crear nuevo */}
            <button
                onClick={() => {
                  setShowCreateForm((v) => !v)
                  setEditingWorkspaceId(null)
                  setWorkspaceForm(emptyWorkspaceForm())
                }}
                className="w-full rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400 hover:border-blue-500/40 hover:text-blue-400 transition-all text-left"
            >
              + New Project
            </button>

            {/* Form crear/editar */}
            {(showCreateForm || editingWorkspaceId) && (
                <Card className="border-white/5 bg-white/[0.03]">
                  <CardContent className="pt-4">
                    <WorkspaceForm
                        form={workspaceForm}
                        editingWorkspaceId={editingWorkspaceId}
                        isSaving={isSavingWorkspace}
                        onChange={(field) => (event) =>
                            setWorkspaceForm((cur) => ({ ...cur, [field]: event.target.value }))
                        }
                        onSubmit={handleSubmitWorkspace}
                        onCancel={() => {
                          setShowCreateForm(false)
                          setEditingWorkspaceId(null)
                          setWorkspaceForm(emptyWorkspaceForm())
                        }}
                    />
                  </CardContent>
                </Card>
            )}

            {/* Lista de workspaces */}
            {isLoadingWorkspaces ? (
                <p className="text-sm text-slate-500 text-center py-8">Loading...</p>
            ) : workspaces.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Sin proyectos aún.</p>
            ) : (
                <div className="space-y-2">
                  {filteredWorkspaces.map((ws) => {
                    const isSelected = ws.idWorkspace === selectedWorkspaceId
                    return (
                        <button
                            key={ws.idWorkspace}
                            onClick={() => selectWorkspace(ws)}
                            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                                isSelected
                                    ? 'border-blue-500/40 bg-blue-500/10 ring-1 ring-blue-500/20'
                                    : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                            }`}
                        >
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              ws.datasetPath ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                          }`}>
                            <DatabaseIcon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{ws.name}</p>
                            <p className="text-[10px] text-slate-500">
                              {ws.datasetPath ? '● Dataset activo' : '○ Sin dataset'}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                      <span
                          className="text-[10px] text-slate-500 hover:text-white px-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingWorkspaceId(ws.idWorkspace)
                            setWorkspaceForm({ name: ws.name, description: ws.description ?? '' })
                            setShowCreateForm(false)
                          }}
                      >Edit</span>
                            <span
                                className="text-[10px] text-red-500 hover:text-red-400 px-1"
                                onClick={(e) => { e.stopPropagation(); void handleDeleteWorkspace(ws.idWorkspace) }}
                            >Del</span>
                          </div>
                          {isSelected && <ChevronRight size={14} className="text-blue-400 shrink-0" />}
                        </button>
                    )
                  })}
                </div>
            )}
          </div>

          {/* ── Columna derecha: detalle del workspace seleccionado ── */}
          <div>
            {!selectedWorkspace ? (
                <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 text-slate-600">
                  Selecciona un proyecto para ver sus detalles.
                </div>
            ) : (
                <div className="space-y-6">

                  {/* Dataset + Pipelines lado a lado */}
                  <div className="grid gap-6 md:grid-cols-2">

                    {/* Dataset */}
                    <Card className="border-white/5 bg-white/[0.02]">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-sm">Dataset</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <DatasetPanel
                            datasetPath={selectedWorkspace.datasetPath}
                            datasetFile={datasetFile}
                            isUploading={isUploadingDataset}
                            workspaceId={selectedWorkspaceId}
                            token={token}
                            onFileChange={(e) => setDatasetFile(e.target.files?.[0] ?? null)}
                            onSubmit={handleDatasetUpload}
                            onDelete={handleDeleteDataset}
                            onUrlDownload={handleUrlDownload}
                        />
                      </CardContent>
                    </Card>

                    {/* Pipelines */}
                    <Card className="border-white/5 bg-white/[0.02]">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-sm">Pipelines</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <PipelinesPanel
                            pipelines={pipelines}
                            isLoadingPipelines={isLoadingPipelines}
                            pipelineName={pipelineForm.name}
                            isSavingPipeline={isSavingPipeline}
                            renamingPipelineId={renamingPipelineId}
                            renameValue={renameValue}
                            selectedForExecId={selectedPipelineForExec?.idPipeline ?? null}
                            onPipelineNameChange={(v) => setPipelineForm({ name: v })}
                            onRenameValueChange={setRenameValue}
                            onCreate={handleCreatePipeline}
                            onStartRename={(p) => { setRenamingPipelineId(p.idPipeline); setRenameValue(p.name) }}
                            onCancelRename={() => { setRenamingPipelineId(null); setRenameValue('') }}
                            onSaveRename={handleSaveRename}
                            onDelete={handleDeletePipeline}
                            onSelectForExec={setSelectedPipelineForExec}
                        />
                      </CardContent>
                    </Card>
                  </div>

                  {/* Execution Panel — ancho completo, solo cuando hay pipeline seleccionado */}
                  {selectedPipelineForExec && (
                      <ExecutionPanel
                          token={token}
                          workspaceId={selectedWorkspace.idWorkspace}
                          pipelineId={selectedPipelineForExec.idPipeline}
                          pipelineName={selectedPipelineForExec.name}
                          hasDataset={!!selectedWorkspace.datasetPath}
                          onAuthError={onAuthError}
                      />
                  )}
                </div>
            )}
          </div>
        </div>
      </div>
  )
}