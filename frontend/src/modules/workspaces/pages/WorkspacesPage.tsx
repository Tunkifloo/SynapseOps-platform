import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Database as DatabaseIcon } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  emptyPipelineForm,
  emptyWorkspaceForm,
  extractFilename,
  type PipelineFormData,
  type PipelineSummary,
  type WorkspaceFormData,
  type WorkspaceSummary,
} from '@/features/workspaces/types'
import { SectionTitle } from '@/shared/components/SectionTitle'
import { useAppStore } from '@/store/useAppStore'

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
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null)
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormData>(emptyWorkspaceForm())
  const [pipelineForm, setPipelineForm] = useState<PipelineFormData>(emptyPipelineForm())
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<number | null>(null)
  const [renamingPipelineId, setRenamingPipelineId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [datasetFile, setDatasetFile] = useState<File | null>(null)
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true)
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(false)
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const [isSavingPipeline, setIsSavingPipeline] = useState(false)
  const [isUploadingDataset, setIsUploadingDataset] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const filteredWorkspaces = searchQuery
    ? workspaces.filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : workspaces

  const selectWorkspace = useCallback((workspace: WorkspaceSummary) => {
    setSelectedWorkspaceId(workspace.idWorkspace)
    setWorkspace(workspace.name)
    setIsLoadingPipelines(true)
    listWorkspacePipelines(token, workspace.idWorkspace)
      .then((data) => {
        setPipelines(data)
        setError(null)
      })
      .catch((error) => {
        if (!onAuthError(error)) {
          setError(error instanceof Error ? error.message : 'No se pudieron cargar los pipelines del proyecto.')
        }
      })
      .finally(() => {
        setIsLoadingPipelines(false)
      })
  }, [onAuthError, setWorkspace, token])

  const loadWorkspaces = useCallback(async (preferredId?: number | null) => {
    setIsLoadingWorkspaces(true)
    try {
      const data = await listMyWorkspaces(token)
      setWorkspaces(data)
      if (data.length === 0) {
        setSelectedWorkspaceId(null)
        setWorkspace('Default Project')
        setPipelines([])
      } else {
        const next = data.find((item) => item.idWorkspace === preferredId) ?? data[0]
        setSelectedWorkspaceId(next.idWorkspace)
        setWorkspace(next.name)
        setIsLoadingPipelines(true)
        listWorkspacePipelines(token, next.idWorkspace)
          .then((pipeData) => { setPipelines(pipeData); setError(null) })
          .catch((err) => { if (!onAuthError(err)) setError(err instanceof Error ? err.message : 'Error loading pipelines.') })
          .finally(() => { setIsLoadingPipelines(false) })
      }
      setError(null)
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudieron cargar tus proyectos.')
    } finally {
      setIsLoadingWorkspaces(false)
    }
  }, [onAuthError, setWorkspace, token])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) {
        void loadWorkspaces()
      }
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loadWorkspaces])

  const selectedWorkspace = workspaces.find((item) => item.idWorkspace === selectedWorkspaceId) ?? null

  const handleWorkspaceFieldChange = (field: keyof WorkspaceFormData) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setWorkspaceForm((current) => ({ ...current, [field]: event.target.value }))
  }

  const resetWorkspaceForm = () => {
    setWorkspaceForm(emptyWorkspaceForm())
    setEditingWorkspaceId(null)
  }

  const handleSubmitWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSavingWorkspace(true)
    setNotice(null)

    try {
      const savedWorkspace = editingWorkspaceId
        ? await updateWorkspace(token, editingWorkspaceId, workspaceForm)
        : await createWorkspace(token, workspaceForm)

      setNotice(editingWorkspaceId ? 'Workspace updated successfully.' : 'Workspace created successfully.')
      setError(null)
      resetWorkspaceForm()

      setWorkspaces((prev) => {
        if (editingWorkspaceId) {
          return prev.map((w) => w.idWorkspace === savedWorkspace.idWorkspace ? savedWorkspace : w)
        }
        return [savedWorkspace, ...prev]
      })
      selectWorkspace(savedWorkspace)
    } catch (error) {
      if (onAuthError(error)) {
        return
      }
      setError(error instanceof Error ? error.message : 'No se pudo guardar el workspace.')
    } finally {
      setIsSavingWorkspace(false)
    }
  }

  const startEditingWorkspace = (workspace: WorkspaceSummary) => {
    setEditingWorkspaceId(workspace.idWorkspace)
    setWorkspaceForm({ name: workspace.name, description: workspace.description ?? '' })
  }

  const handleDeleteWorkspace = async (workspaceId: number) => {
    setNotice(null)

    try {
      await deleteWorkspace(token, workspaceId)
      setError(null)
      setNotice('Workspace deleted successfully.')
      resetWorkspaceForm()

      setWorkspaces((prev) => prev.filter((w) => w.idWorkspace !== workspaceId))
      if (selectedWorkspaceId === workspaceId) {
        setSelectedWorkspaceId(null)
        setWorkspace('Default Project')
        setPipelines([])
      }
    } catch (error) {
      if (onAuthError(error)) {
        return
      }
      setError(error instanceof Error ? error.message : 'No se pudo eliminar el workspace.')
    }
  }

  const handleDatasetUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedWorkspaceId || !datasetFile) {
      setError('Select a workspace and file before uploading a dataset.')
      return
    }

    setIsUploadingDataset(true)
    setNotice(null)

    try {
      const message = await uploadDataset(token, selectedWorkspaceId, datasetFile)
      setDatasetFile(null)
      setError(null)
      setNotice(message)
      const updatedList = await listMyWorkspaces(token)
      setWorkspaces(updatedList)
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo cargar el dataset.')
    } finally {
      setIsUploadingDataset(false)
    }
  }

  const handleDeleteDataset = async () => {
    if (!selectedWorkspaceId || !selectedWorkspace?.datasetPath) return
    setNotice(null)
    try {
      await deleteDataset(token, selectedWorkspaceId, extractFilename(selectedWorkspace.datasetPath))
      setError(null)
      setNotice('Dataset removed successfully.')
      const updatedList = await listMyWorkspaces(token)
      setWorkspaces(updatedList)
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo eliminar el dataset.')
    }
  }

  const handleUrlDownload = async (url: string) => {
    if (!selectedWorkspaceId) return
    setNotice(null)
    try {
      const message = await uploadDatasetFromUrl(token, selectedWorkspaceId, url)
      setError(null)
      setNotice(message)
      const updatedList = await listMyWorkspaces(token)
      setWorkspaces(updatedList)
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo descargar el dataset desde la URL.')
    }
  }

  const handleCreatePipeline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedWorkspaceId) {
      setError('Select a workspace before creating a pipeline.')
      return
    }

    setIsSavingPipeline(true)
    setNotice(null)

    try {
      const created = await createPipeline(token, selectedWorkspaceId, pipelineForm)
      setPipelineForm(emptyPipelineForm())
      setPipelines((prev) => [...prev, created])
      setError(null)
      setNotice('Pipeline created successfully.')
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo crear el pipeline.')
    } finally {
      setIsSavingPipeline(false)
    }
  }

  const handleSaveRename = async (pipelineId: number) => {
    if (!selectedWorkspaceId || !renameValue.trim()) return

    setIsSavingPipeline(true)
    setNotice(null)

    try {
      const updated = await renamePipeline(token, selectedWorkspaceId, pipelineId, renameValue.trim())
      setPipelines((prev) => prev.map((p) => p.idPipeline === pipelineId ? updated : p))
      setRenamingPipelineId(null)
      setRenameValue('')
      setError(null)
      setNotice('Pipeline renamed successfully.')
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo renombrar el pipeline.')
    } finally {
      setIsSavingPipeline(false)
    }
  }

  const handleDeletePipeline = async (pipelineId: number) => {
    if (!selectedWorkspaceId) return

    setNotice(null)

    try {
      await deletePipeline(token, selectedWorkspaceId, pipelineId)
      setPipelines((prev) => prev.filter((p) => p.idPipeline !== pipelineId))
      setError(null)
      setNotice('Pipeline deleted successfully.')
    } catch (error) {
      if (onAuthError(error)) return
      setError(error instanceof Error ? error.message : 'No se pudo eliminar el pipeline.')
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="HU-014" title="Workspace Project Management" description="Administra tus proyectos MLOps, su dataset aislado y los pipelines asociados al workspace seleccionado sin salir del contexto del estudiante autenticado." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard title="My Projects" value={isLoadingWorkspaces ? '...' : String(workspaces.length)} />
        <StatCard title="Workspace Pipelines" value={selectedWorkspaceId ? (isLoadingPipelines ? '...' : String(pipelines.length)) : '0'} />
        <StatCard title="Dataset Status" value={selectedWorkspace?.datasetPath ? 'Attached' : 'Pending'} />
      </div>

      {(error || notice) && (
        <Card className={`border-white/5 ${error ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          <CardContent className="pt-6 text-sm text-white">{error ?? notice}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_2fr]">
        <div className="space-y-6">
          <Card className="border-white/5 bg-white/[0.03]">
            <CardContent className="pt-6">
              <WorkspaceForm
                form={workspaceForm}
                editingWorkspaceId={editingWorkspaceId}
                isSaving={isSavingWorkspace}
                onChange={handleWorkspaceFieldChange}
                onSubmit={handleSubmitWorkspace}
                onCancel={resetWorkspaceForm}
              />
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-white/[0.03]">
            <CardContent className="pt-6">
              {isLoadingWorkspaces && (
                <p className="text-sm text-slate-400 py-8 text-center">Loading projects...</p>
              )}
              {!isLoadingWorkspaces && workspaces.length === 0 && (
                <p className="text-sm text-slate-400 py-8 text-center">No projects created yet.</p>
              )}
              {!isLoadingWorkspaces && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredWorkspaces.map((item) => {
                    const isSelected = item.idWorkspace === selectedWorkspaceId
                    return (
                      <button
                        key={item.idWorkspace}
                        type="button"
                        onClick={() => selectWorkspace(item)}
                        className={`relative flex flex-col items-center justify-center rounded-2xl border p-4 text-center transition-all ${
                          isSelected
                            ? 'border-blue-500/40 bg-blue-500/10 ring-1 ring-blue-500/30'
                            : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${
                          item.datasetPath ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          <DatabaseIcon className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-semibold text-white line-clamp-1">{item.name}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {item.datasetPath ? 'Dataset ✓' : 'No dataset'}
                        </p>
                        <div className="mt-3 flex gap-1">
                          <span
                            className="text-[10px] border border-white/10 px-2 py-0.5 rounded-2xl text-slate-300 hover:bg-white/10"
                            onClick={(e) => { e.stopPropagation(); startEditingWorkspace(item) }}
                          >
                            Edit
                          </span>
                          <span
                            className="text-[10px] bg-red-400/10 text-red-400 px-2 py-0.5 rounded-2xl hover:bg-red-400/20"
                            onClick={(e) => { e.stopPropagation(); void handleDeleteWorkspace(item.idWorkspace) }}
                          >
                            Delete
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-white/5 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-white">Selected Workspace Context</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedWorkspace && (
                <p className="text-sm text-slate-400">Select or create a project to inspect its isolated dataset and pipelines.</p>
              )}

              {selectedWorkspace && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-white/5 bg-black/20">
                      <CardHeader>
                        <CardTitle className="text-white">Dataset Isolation</CardTitle>
                      </CardHeader>
                      <CardContent>
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
                      </CardContent>
                    </Card>

                    <PipelinesPanel
                      pipelines={pipelines}
                      isLoadingPipelines={isLoadingPipelines}
                      pipelineName={pipelineForm.name}
                      isSavingPipeline={isSavingPipeline}
                      renamingPipelineId={renamingPipelineId}
                      renameValue={renameValue}
                      onPipelineNameChange={(value) => setPipelineForm({ name: value })}
                      onRenameValueChange={setRenameValue}
                      onCreate={handleCreatePipeline}
                      onStartRename={(pipeline) => {
                        setRenamingPipelineId(pipeline.idPipeline)
                        setRenameValue(pipeline.name)
                      }}
                      onCancelRename={() => {
                        setRenamingPipelineId(null)
                        setRenameValue('')
                      }}
                      onSaveRename={handleSaveRename}
                      onDelete={handleDeletePipeline}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
