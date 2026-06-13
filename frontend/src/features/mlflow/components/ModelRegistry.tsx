import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Hash,
  Loader2,
  Rocket,
  Trash2,
} from 'lucide-react'

import { Card, CardContent } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { notify } from '@/shared/notify'
import { setDeployHandoff } from '@/features/pipelines/deployHandoff'
import type { MlflowModelVersion, ModelStage } from '../api'
import { DeleteVersionDialog } from './DeleteVersionDialog'

export interface RegistryModel {
  name: string
  latestVersion: string
  latestRunId?: string
  ownedVersions?: number
}

/**
 * Capa de datos inyectable: el mismo UI sirve para el registro global (ADMIN,
 * solo-lectura) y el registro por workspace (dueño, CRUD completo). Las acciones
 * de escritura se omiten si la función correspondiente no se provee.
 */
export interface ConfusionMatrix {
  labels: string[]
  matrix: number[][]
}

export interface VersionDetails {
  params: Record<string, string>
  metrics: Record<string, number>
  confusionMatrix?: ConfusionMatrix | null
}

export interface RegistryApi {
  listModels: () => Promise<RegistryModel[]>
  getVersions: (modelName: string) => Promise<MlflowModelVersion[]>
  deleteVersion?: (modelName: string, version: string) => Promise<void>
  transitionStage?: (modelName: string, version: string, stage: ModelStage) => Promise<unknown>
  getMetrics?: (runId: string) => Promise<{ accuracy: number | null; loss: number | null }>
  /** Detalle completo (hiperparámetros + métricas) de una versión. */
  getDetails?: (modelName: string, version: string, runId: string) => Promise<VersionDetails>
  allowDeploy?: boolean
  /** Despliega el model-service directamente (sin pasar por el lienzo). */
  deploy?: (runId: string) => Promise<{ status: string; endpoint: string | null }>
}

interface ModelRegistryProps {
  api: RegistryApi
  onAuthError: (error: unknown) => boolean
}

const STAGES: ModelStage[] = ['None', 'Staging', 'Production', 'Archived']

export function stageVariant(stage: string): 'success' | 'warning' | 'secondary' | 'outline' {
  switch (stage) {
    case 'Production':
      return 'success'
    case 'Staging':
      return 'warning'
    case 'Archived':
      return 'secondary'
    default:
      return 'outline'
  }
}

export function formatModelDate(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface VersionCardProps {
  api: RegistryApi
  modelName: string
  version: MlflowModelVersion
  onAuthError: (error: unknown) => boolean
  onChanged: () => void
}

export function VersionCard({ api, modelName, version, onAuthError, onChanged }: VersionCardProps) {
  const navigate = useNavigate()
  const [accuracy, setAccuracy] = useState<number | null>(version.accuracy ?? null)
  const [loss, setLoss] = useState<number | null>(version.loss ?? null)
  const [stage, setStage] = useState<string>(version.stage)
  const [isPromoting, setIsPromoting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [details, setDetails] = useState<VersionDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  const toggleDetails = async () => {
    const next = !detailsOpen
    setDetailsOpen(next)
    if (next && !details && api.getDetails) {
      setLoadingDetails(true)
      try {
        setDetails(await api.getDetails(modelName, version.version, version.runId))
      } catch (err) {
        if (!onAuthError(err)) setDetails({ params: {}, metrics: {} })
      } finally {
        setLoadingDetails(false)
      }
    }
  }

  const hasEmbeddedMetrics = version.accuracy != null || version.loss != null

  useEffect(() => {
    if (hasEmbeddedMetrics || !api.getMetrics) return
    let active = true
    api.getMetrics(version.runId)
      .then((m) => {
        if (active) {
          setAccuracy(m.accuracy)
          setLoss(m.loss)
        }
      })
      .catch(() => {
        /* métricas informativas */
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version.runId])

  const [deploying, setDeploying] = useState(false)

  const handleDeploy = async () => {
    // Despliegue directo si la capa de datos lo soporta; si no, handoff al lienzo.
    if (!api.deploy) {
      setDeployHandoff({ runId: version.runId, modelName, version: version.version })
      notify.info('Modelo listo para desplegar', {
        description: `${modelName} · v${version.version} — confírmalo en el nodo de Despliegue.`,
      })
      navigate('/builder')
      return
    }
    setDeploying(true)
    notify.info('Despliegue en curso', {
      description: 'Puede tardar varios minutos (build de la imagen). Te notificaremos cuando esté listo.',
    })
    try {
      const res = await api.deploy(version.runId)
      if (res.status === 'RUNNING') {
        notify.success('model-service desplegado', {
          description: `${modelName} · v${version.version}${res.endpoint ? ` · ${res.endpoint}` : ''} — gestiónalo en "Despliegues".`,
        })
      } else {
        notify.error('El despliegue no pasó el health check del model-service')
      }
    } catch (err) {
      if (!onAuthError(err)) {
        notify.error('No se pudo desplegar', { description: err instanceof Error ? err.message : undefined })
      }
    } finally {
      setDeploying(false)
    }
  }

  const handlePromote = async (next: string) => {
    if (next === stage || !api.transitionStage) return
    setIsPromoting(true)
    try {
      await api.transitionStage(modelName, version.version, next as ModelStage)
      setStage(next)
      notify.success('Stage actualizado', { description: `${modelName} · v${version.version} → ${next}` })
      onChanged()
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo actualizar el stage')
    } finally {
      setIsPromoting(false)
    }
  }

  const handleDelete = async () => {
    if (!api.deleteVersion) return
    await api.deleteVersion(modelName, version.version)
    notify.success('Versión eliminada', {
      description: `${modelName} · v${version.version} se eliminó del Registry.`,
    })
    onChanged()
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Versión {version.version}</span>
            <Badge variant={stageVariant(stage)}>{stage}</Badge>
          </div>
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <Hash className="size-3" />
            <span className="max-w-[220px] truncate" title={version.runId}>
              {version.runId}
            </span>
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock className="size-3" />
            {formatModelDate(version.creationTimestamp)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Accuracy</span>
          <span className="text-base font-semibold text-success-strong">
            {accuracy != null ? accuracy.toFixed(4) : '—'}
          </span>
          <span className="text-[10px] text-muted-foreground">loss {loss != null ? loss.toFixed(4) : '—'}</span>
        </div>
      </div>

      {(api.allowDeploy || api.transitionStage || api.deleteVersion) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {api.allowDeploy && (
            <Button
              type="button"
              size="sm"
              variant="cta"
              className="h-8"
              onClick={() => void handleDeploy()}
              disabled={deploying}
              loading={deploying}
            >
              <Rocket className="mr-1.5 size-3.5" />
              {deploying ? 'Desplegando…' : 'Desplegar'}
            </Button>
          )}

          {api.transitionStage && (
            <Select value={stage} onValueChange={(v) => void handlePromote(v)} disabled={isPromoting}>
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Cambiar stage">
                {isPromoting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" /> Aplicando…
                  </span>
                ) : (
                  <SelectValue placeholder="Stage" />
                )}
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {api.deleteVersion && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="ml-auto h-8"
              onClick={() => setConfirmOpen(true)}
              aria-label={`Eliminar versión ${version.version}`}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Eliminar
            </Button>
          )}
        </div>
      )}

      {api.getDetails && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            onClick={() => void toggleDetails()}
            className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out-quart hover:text-foreground"
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Detalles (arquitectura · hiperparámetros · métricas)
          </button>
          {detailsOpen && (
            <div className="mt-2 space-y-3 rounded-lg border border-border bg-card p-3">
              {loadingDetails ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Cargando…
                </p>
              ) : (
                <>
                  <DetailGrid
                    title="Hiperparámetros"
                    entries={Object.entries(details?.params ?? {})}
                    format={(v) => String(v)}
                  />
                  <DetailGrid
                    title="Métricas"
                    entries={Object.entries(details?.metrics ?? {})}
                    format={(v) => (typeof v === 'number' ? v.toFixed(4) : String(v))}
                    valueClass="text-success-strong"
                  />
                  <QualityReport metrics={details?.metrics ?? {}} />
                  {details?.confusionMatrix && <ConfusionMatrixView cm={details.confusionMatrix} />}
                  {(!details ||
                    (Object.keys(details.params).length === 0 &&
                      Object.keys(details.metrics).length === 0)) && (
                    <p className="text-xs text-muted-foreground">Sin detalles disponibles para esta versión.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {api.deleteVersion && (
        <DeleteVersionDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          modelName={modelName}
          version={version.version}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

export function ConfusionMatrixView({ cm }: { cm: ConfusionMatrix }) {
  const max = Math.max(1, ...cm.matrix.flat())
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Matriz de confusión{' '}
        <span className="text-muted-foreground/70 normal-case">(filas = real, columnas = predicho)</span>
      </p>
      <div className="overflow-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="p-1" />
              {cm.labels.map((l) => (
                <th key={l} className="max-w-[44px] truncate p-1 font-mono text-muted-foreground" title={l}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cm.matrix.map((row, i) => (
              <tr key={i}>
                <th
                  className="max-w-[44px] truncate p-1 text-right font-mono text-muted-foreground"
                  title={cm.labels[i]}
                >
                  {cm.labels[i]}
                </th>
                {row.map((v, j) => {
                  const intensity = v / max
                  const correct = i === j
                  return (
                    <td
                      key={j}
                      className="size-7 text-center font-mono text-[10px] text-foreground"
                      style={{
                        backgroundColor: correct
                          ? `color-mix(in oklch, var(--success) ${10 + intensity * 70}%, transparent)`
                          : `color-mix(in oklch, var(--destructive) ${intensity * 70}%, transparent)`,
                      }}
                      title={`real ${cm.labels[i]} → pred ${cm.labels[j]}: ${v}`}
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface DetailGridProps {
  title: string
  entries: [string, string | number][]
  format: (value: string | number) => string
  valueClass?: string
}

/**
 * Reporte de calidad del modelo a partir de las métricas del run: brecha de
 * overfitting (accuracy − val_accuracy) y deriva de datos (PSI de split y
 * re-entrenamiento, logueados por el ml-engine). Se oculta si la versión no
 * tiene estas métricas (modelos previos a la telemetría de calidad).
 */
function QualityReport({ metrics }: { metrics: Record<string, number> }) {
  const acc = metrics.accuracy ?? metrics.final_accuracy
  const val = metrics.val_accuracy
  const gap = acc != null && val != null ? acc - val : null
  const splitPsi = metrics.drift_split_max_psi
  const retrainPsi = metrics.drift_retrain_max_psi
  if (gap == null && splitPsi == null && retrainPsi == null) return null

  type Tone = 'ok' | 'warn' | 'bad'
  const chips: { label: string; tone: Tone }[] = []
  if (gap != null) {
    const g = (gap * 100).toFixed(1)
    chips.push(gap > 0.15
      ? { label: `Overfitting alto — brecha train/val ${g}%`, tone: 'bad' }
      : gap > 0.08
        ? { label: `Ligero overfitting — brecha train/val ${g}%`, tone: 'warn' }
        : { label: 'Sin señales de overfitting (train ≈ val)', tone: 'ok' })
  }
  const psiTone = (p: number): Tone => (p >= 0.25 ? 'bad' : p >= 0.1 ? 'warn' : 'ok')
  const psiLabel = (p: number) => (p >= 0.25 ? 'significativa' : p >= 0.1 ? 'moderada' : 'estable')
  if (splitPsi != null) chips.push({ label: `Calidad del split (train vs val): deriva ${psiLabel(splitPsi)} · PSI ${splitPsi.toFixed(2)}`, tone: psiTone(splitPsi) })
  if (retrainPsi != null) chips.push({ label: `Cambio de datos vs corrida previa: deriva ${psiLabel(retrainPsi)} · PSI ${retrainPsi.toFixed(2)}`, tone: psiTone(retrainPsi) })

  const toneClass: Record<Tone, string> = {
    ok: 'bg-success/10 text-success-strong',
    warn: 'bg-warning/15 text-warning-strong',
    bad: 'bg-destructive/10 text-destructive-strong',
  }
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Calidad y data drift</p>
      <div className="flex flex-col gap-1.5">
        {chips.map((c, i) => (
          <span key={i} className={`rounded-md px-2 py-1 text-[11px] font-medium ${toneClass[c.tone]}`}>{c.label}</span>
        ))}
      </div>
    </div>
  )
}

function DetailGrid({ title, entries, format, valueClass }: DetailGridProps) {
  if (entries.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-md bg-muted/60 px-2 py-1.5">
            <p className="truncate text-[10px] text-muted-foreground" title={key}>
              {key.replace(/_/g, ' ')}
            </p>
            <p className={`truncate font-mono text-xs ${valueClass ?? 'text-foreground'}`} title={String(value)}>
              {format(value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ModelRegistry({ api, onAuthError }: ModelRegistryProps) {
  const [models, setModels] = useState<RegistryModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, MlflowModelVersion[]>>({})
  const [loadingVersions, setLoadingVersions] = useState(false)

  const loadModels = useCallback(async () => {
    setIsLoading(true)
    try {
      setModels(await api.listModels())
    } catch (err) {
      if (!onAuthError(err)) setModels([])
    } finally {
      setIsLoading(false)
    }
  }, [api, onAuthError])

  const loadVersions = useCallback(
    async (modelName: string) => {
      setLoadingVersions(true)
      try {
        setVersions((prev) => ({ ...prev, [modelName]: [] }))
        const vers = await api.getVersions(modelName)
        setVersions((prev) => ({ ...prev, [modelName]: vers }))
      } catch (err) {
        if (!onAuthError(err)) setVersions((prev) => ({ ...prev, [modelName]: [] }))
      } finally {
        setLoadingVersions(false)
      }
    },
    [api, onAuthError]
  )

  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadModels()
  }, [api])

  useEffect(() => {
    const refresh = () => {
      void loadModels()
      if (expanded) void loadVersions(expanded)
    }
    window.addEventListener('synapseops:refresh-mlflow', refresh)
    return () => window.removeEventListener('synapseops:refresh-mlflow', refresh)
  }, [loadModels, loadVersions, expanded])
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const toggle = (modelName: string) => {
    if (expanded === modelName) {
      setExpanded(null)
      return
    }
    setExpanded(modelName)
    if (!versions[modelName]) void loadVersions(modelName)
  }

  return (
    <Card className="py-0">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Box className="size-5" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">Modelos registrados</h3>
              <p className="text-xs text-muted-foreground">
                Versiones, métricas y stage desde el Model Registry de MLflow
              </p>
            </div>
          </div>
          <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary-strong">
            {models.length}
          </span>
        </div>

        {isLoading ? (
          <div className="flex min-h-36 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Cargando modelos…
          </div>
        ) : models.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-5 text-center">
            <Box className="mb-3 size-9 text-muted-foreground/60" />
            <p className="text-base font-semibold text-foreground">No hay modelos registrados.</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              Los modelos aparecerán aquí cuando un pipeline complete un entrenamiento y registre el artefacto.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {models.map((model) => (
              <div key={model.name} className="rounded-xl border border-border bg-card">
                <button
                  onClick={() => toggle(model.name)}
                  className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors duration-150 ease-out-quart hover:bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{model.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Última versión: <span className="text-primary-strong">v{model.latestVersion}</span>
                      {model.ownedVersions != null && (
                        <span className="ml-2 text-muted-foreground/70">· {model.ownedVersions} versión(es)</span>
                      )}
                    </p>
                  </div>
                  {expanded === model.name ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </button>

                {expanded === model.name && (
                  <div className="space-y-3 border-t border-border p-4">
                    {loadingVersions && (versions[model.name]?.length ?? 0) === 0 && (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" /> Cargando versiones…
                      </p>
                    )}
                    {!loadingVersions && versions[model.name]?.length === 0 && (
                      <p className="text-xs text-muted-foreground">Este modelo no tiene versiones.</p>
                    )}
                    {versions[model.name]?.map((version) => (
                      <VersionCard
                        key={version.version}
                        api={api}
                        modelName={model.name}
                        version={version}
                        onAuthError={onAuthError}
                        onChanged={() => void loadVersions(model.name)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
