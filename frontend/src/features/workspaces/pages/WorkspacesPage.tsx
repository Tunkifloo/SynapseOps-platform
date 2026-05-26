import { useCallback, useEffect, useMemo, useState, type ComponentType, type FormEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Layers,
  Monitor,
  Plus,
  UserRound,
} from 'lucide-react'
import { authorizedRequest } from '@/shared/api/client'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  createPipeline,
  createWorkspace,
  deleteDataset,
  deletePipeline,
  deleteWorkspace,
  listMyWorkspaces,
  listWorkspacePipelines,
  renamePipeline,
  updateWorkspace,
  uploadDataset,
  uploadDatasetFromUrl,
} from '@/features/workspaces/api'
import { DatasetPanel } from '@/features/workspaces/components/DatasetPanel'
import { PipelinesPanel } from '@/features/workspaces/components/PipelinesPanel'
import { WorkspaceForm } from '@/features/workspaces/components/WorkspaceForm'
import { ExecutionPanel } from '@/features/executions/components/ExecutionPanel'
import {
  emptyPipelineForm,
  emptyWorkspaceForm,
  extractFilename,
  type PipelineFormData,
  type PipelineSummary,
  type WorkspaceFormData,
  type WorkspaceSummary,
} from '@/features/workspaces/types'
import { Button } from '@/shared/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

const PAGE_SIZE = 7

interface StatCardProps {
  title: string
  value: string
  icon: ComponentType<{ className?: string }>
}

function StatCard({ title, value, icon: Icon }: StatCardProps) {
  return (
    <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
      <CardContent className="flex items-center gap-4 p-4 xl:p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 text-blue-400 xl:h-12 xl:w-12">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </p>
          <div className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-50 xl:text-2xl">
            {value}
          </div>
        </div>
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
  const currentWorkspace = useAppStore((state) => state.currentWorkspace)
  const role = useAppStore((state) => state.user?.role)

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null)
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormData>(emptyWorkspaceForm())
  const [pipelineForm, setPipelineForm] = useState<PipelineFormData>(emptyPipelineForm())
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<number | null>(null)
  const [renamingPipelineId, setRenamingPipelineId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [datasetFile, setDatasetFile] = useState<File | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true)
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(false)
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const [isSavingPipeline, setIsSavingPipeline] = useState(false)
  const [isUploadingDataset, setIsUploadingDataset] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedPipelineForExec, setSelectedPipelineForExec] = useState<PipelineSummary | null>(null)
  const [workspacePage, setWorkspacePage] = useState(1)

  const selectedWorkspace = workspaces.find((workspace) => workspace.idWorkspace === selectedWorkspaceId) ?? null

  const filteredWorkspaces = useMemo(() => (
    searchQuery
      ? workspaces.filter((workspace) => workspace.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : workspaces
  ), [searchQuery, workspaces])

  const totalPages = Math.max(1, Math.ceil(filteredWorkspaces.length / PAGE_SIZE))
  const effectivePage = Math.min(workspacePage, totalPages)
  const pagedWorkspaces = filteredWorkspaces.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE)

  const loadWorkspaces = useCallback(async (preferredId?: number | null) => {
    setIsLoadingWorkspaces(true)
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      if (data.length > 0) {
        const next = data.find((workspace) => workspace.idWorkspace === preferredId) ?? data[0]
        setSelectedWorkspaceId(next.idWorkspace)
        setWorkspace(next.name)
        setIsLoadingPipelines(true)
        listWorkspacePipelines(token, next.idWorkspace)
          .then((items) => { setPipelines(items); setError(null) })
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

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { void loadWorkspaces() }, [token, onAuthError, setWorkspace])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const selectWorkspace = useCallback((workspace: WorkspaceSummary) => {
    setSelectedWorkspaceId(workspace.idWorkspace)
    setWorkspace(workspace.name)
    setSelectedPipelineForExec(null)
    setIsLoadingPipelines(true)
    listWorkspacePipelines(token, workspace.idWorkspace)
      .then((items) => { setPipelines(items); setError(null) })
      .catch((err) => { if (!onAuthError(err)) setError('Error cargando pipelines.') })
      .finally(() => setIsLoadingPipelines(false))
  }, [token, onAuthError, setWorkspace])

  const handleSubmitWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSavingWorkspace(true)
    setNotice(null)
    try {
      const saved = editingWorkspaceId
        ? await updateWorkspace(token, editingWorkspaceId, workspaceForm)
        : await createWorkspace(token, workspaceForm)
      setNotice(editingWorkspaceId ? 'Proyecto actualizado.' : 'Proyecto creado.')
      setError(null)
      setWorkspaceForm(emptyWorkspaceForm())
      setEditingWorkspaceId(null)
      setShowCreateForm(false)
      setWorkspaces((prev) =>
        editingWorkspaceId
          ? prev.map((workspace) => workspace.idWorkspace === saved.idWorkspace ? saved : workspace)
          : [saved, ...prev],
      )
      selectWorkspace(saved)
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error guardando proyecto.')
    } finally {
      setIsSavingWorkspace(false)
    }
  }

  const handleDeleteWorkspace = async (id: number) => {
    setNotice(null)
    try {
      await deleteWorkspace(token, id)
      setNotice('Proyecto eliminado.')
      setError(null)
      if (selectedWorkspaceId === id) {
        setSelectedWorkspaceId(null)
        setPipelines([])
        setSelectedPipelineForExec(null)
      }
      const updated = await listMyWorkspaces(token)
      setWorkspaces(updated)
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error eliminando proyecto.')
    }
  }

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

  const handleUrlDownload = async (url: string) => {
    if (!selectedWorkspaceId) return
    setNotice(null)
    try {
      let message: string

      if (url.startsWith('__keras__')) {
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
      setPipelines((prev) => prev.map((pipeline) => pipeline.idPipeline === pipelineId ? updated : pipeline))
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
      setPipelines((prev) => prev.filter((pipeline) => pipeline.idPipeline !== pipelineId))
      if (selectedPipelineForExec?.idPipeline === pipelineId) {
        setSelectedPipelineForExec(null)
      }
      setNotice('Pipeline eliminado.')
    } catch (err) {
      if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error eliminando pipeline.')
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50 xl:text-3xl">
          Gestión de proyectos del espacio de trabajo
        </h1>
        <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-400 xl:text-base">
          Selecciona un proyecto para gestionar su dataset, pipelines y ejecutar entrenamientos.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Mis proyectos" value={isLoadingWorkspaces ? '...' : String(workspaces.length)} icon={Layers} />
        <StatCard title="Rol actual" value={role ?? 'N/A'} icon={UserRound} />
        <StatCard title="Espacio actual" value={currentWorkspace || 'Ninguno'} icon={Monitor} />
      </div>

      {(error ?? notice) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          error
            ? 'border-red-500/20 bg-red-500/10 text-red-300'
            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
        }`}
        >
          {error ?? notice}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-[0.95fr_1fr_1.25fr]">
        <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
          <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pt-5">
            <CardTitle className="text-lg font-semibold text-slate-50">Mis proyectos</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setShowCreateForm((value) => !value)
                setEditingWorkspaceId(null)
                setWorkspaceForm(emptyWorkspaceForm())
              }}
              className="h-9 border border-blue-500/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/15"
            >
              <Plus className="mr-2 h-4 w-4 text-blue-400" />
              Nuevo proyecto
            </Button>
          </CardHeader>

          <CardContent className="space-y-3 p-5 pt-4">
            {(showCreateForm || editingWorkspaceId) && (
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-4">
                <WorkspaceForm
                  form={workspaceForm}
                  editingWorkspaceId={editingWorkspaceId}
                  isSaving={isSavingWorkspace}
                  onChange={(field) => (event) =>
                    setWorkspaceForm((current) => ({ ...current, [field]: event.target.value }))}
                  onSubmit={handleSubmitWorkspace}
                  onCancel={() => {
                    setShowCreateForm(false)
                    setEditingWorkspaceId(null)
                    setWorkspaceForm(emptyWorkspaceForm())
                  }}
                />
              </div>
            )}

            {isLoadingWorkspaces ? (
              <p className="py-8 text-center text-sm text-slate-500">Cargando proyectos...</p>
            ) : filteredWorkspaces.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Sin proyectos aún.</p>
            ) : (
              <div className="space-y-2">
                {pagedWorkspaces.map((workspace) => {
                  const isSelected = workspace.idWorkspace === selectedWorkspaceId
                  const statusText = workspace.datasetPath
                    ? 'Dataset activo'
                    : workspace.description || 'Sin dataset'

                  return (
                    <button
                      key={workspace.idWorkspace}
                      onClick={() => selectWorkspace(workspace)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isSelected
                          ? 'border-blue-500/60 bg-blue-500/10'
                          : 'border-slate-800/80 bg-slate-950/30 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-400/10 bg-blue-500/10 text-blue-400">
                          <Database size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-50">{workspace.name}</p>
                          <p className="mt-1 truncate text-xs text-slate-400">{statusText}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className="text-xs text-blue-400 hover:text-blue-300"
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditingWorkspaceId(workspace.idWorkspace)
                              setWorkspaceForm({ name: workspace.name, description: workspace.description ?? '' })
                              setShowCreateForm(false)
                            }}
                          >
                            Editar
                          </span>
                          <span
                            className="text-xs text-red-400 hover:text-red-300"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDeleteWorkspace(workspace.idWorkspace)
                            }}
                          >
                            Eliminar
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {filteredWorkspaces.length > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setWorkspacePage((page) => Math.max(1, page - 1))}
                  disabled={workspacePage === 1}
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="rounded-md bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {workspacePage}
                </span>
                <button
                  onClick={() => setWorkspacePage((page) => Math.min(totalPages, page + 1))}
                  disabled={workspacePage === totalPages}
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-lg font-semibold text-slate-50">Dataset</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-3">
            {selectedWorkspace ? (
              <DatasetPanel
                datasetPath={selectedWorkspace.datasetPath}
                datasetFile={datasetFile}
                isUploading={isUploadingDataset}
                workspaceId={selectedWorkspaceId}
                token={token}
                onFileChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
                onSubmit={handleDatasetUpload}
                onDelete={handleDeleteDataset}
                onUrlDownload={handleUrlDownload}
              />
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-700/70 text-sm text-slate-500">
                Selecciona un proyecto.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20 xl:col-span-2 2xl:col-span-1">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-lg font-semibold text-slate-50">Pipelines</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-3">
            {selectedWorkspace ? (
              <PipelinesPanel
                pipelines={pipelines}
                isLoadingPipelines={isLoadingPipelines}
                pipelineName={pipelineForm.name}
                isSavingPipeline={isSavingPipeline}
                renamingPipelineId={renamingPipelineId}
                renameValue={renameValue}
                selectedForExecId={selectedPipelineForExec?.idPipeline ?? null}
                onPipelineNameChange={(value) => setPipelineForm({ name: value })}
                onRenameValueChange={setRenameValue}
                onCreate={handleCreatePipeline}
                onStartRename={(pipeline) => { setRenamingPipelineId(pipeline.idPipeline); setRenameValue(pipeline.name) }}
                onCancelRename={() => { setRenamingPipelineId(null); setRenameValue('') }}
                onSaveRename={handleSaveRename}
                onDelete={handleDeletePipeline}
                onSelectForExec={setSelectedPipelineForExec}
              />
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-700/70 text-sm text-slate-500">
                Selecciona un proyecto.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedWorkspace && selectedPipelineForExec && (
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
  )
}
