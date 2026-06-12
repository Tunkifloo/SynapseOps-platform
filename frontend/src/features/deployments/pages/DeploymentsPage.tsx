import { useCallback, useEffect, useState } from 'react'
import { Boxes, Copy, FlaskConical, RefreshCw, Rocket, Server, Trash2, Zap } from 'lucide-react'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { isApiError } from '@/shared/api/client'
import { notify } from '@/shared/notify'
import { deployModel, listDeployments, undeployModel } from '../api'
import type { DeploymentItem, DeploymentsView } from '../types'
import { PredictModal } from '../components/PredictModal'

interface DeploymentsPageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

const errMsg = (err: unknown) => (isApiError(err) ? err.message : err instanceof Error ? err.message : '')

/**
 * Módulo "Despliegues" (HU-029): gestiona los model-services del usuario
 * (estado en vivo, cupo TA-004, redesplegar, derribar, endpoint /predict).
 */
export function DeploymentsPage({ token, onAuthError }: DeploymentsPageProps) {
  const [view, setView] = useState<DeploymentsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [confirmKill, setConfirmKill] = useState<DeploymentItem | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        setView(await listDeployments(token))
      } catch (err) {
        if (!onAuthError(err)) notify.error('No se pudieron cargar los despliegues')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [token, onAuthError],
  )

  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(true), 5000) // estado en vivo
    return () => clearInterval(t)
  }, [token])
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const atCap = !!view && view.active >= view.max

  const handleRedeploy = async (item: DeploymentItem) => {
    if (!item.runId) {
      notify.warning('No hay runId para redesplegar este modelo')
      return
    }
    setBusy(item.executionId)
    try {
      const res = await deployModel(token, item.runId)
      if (res.status === 'RUNNING') notify.success('Modelo redesplegado', { description: res.endpoint ?? undefined })
      else notify.error('El redepliegue no pasó el health check')
      await load(true)
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo redesplegar', { description: errMsg(err) })
    } finally {
      setBusy(null)
    }
  }

  const handleKill = async (item: DeploymentItem) => {
    setBusy(item.executionId)
    try {
      await undeployModel(token, item.executionId)
      notify.success('Despliegue derribado')
      await load(true)
    } catch (err) {
      if (!onAuthError(err)) notify.error('No se pudo derribar', { description: errMsg(err) })
    } finally {
      setBusy(null)
      setConfirmKill(null)
    }
  }

  const copyEndpoint = (endpoint: string) => {
    void navigator.clipboard?.writeText(`${endpoint}/predict`)
    notify.info('Endpoint /predict copiado al portapapeles')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Despliegues</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona tus model-services activos, su endpoint y el consumo de cupo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view && (
            <Badge variant={atCap ? 'warning' : 'secondary'} className="gap-1.5">
              <Server className="size-3.5" />
              {view.active} / {view.max} en uso
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Actualizar
          </Button>
        </div>
      </div>

      {atCap && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Alcanzaste el tope de despliegues ({view?.max}). Derriba uno para liberar recursos antes de desplegar otro.
        </p>
      )}

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      ) : !view || view.deployments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Boxes className="mx-auto mb-3 size-8 text-muted-foreground/40" />
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Aún no has desplegado ningún modelo. Ve al lienzo, selecciona un modelo entrenado en el nodo de
            Despliegue y pulsa “Desplegar”.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {view.deployments.map((d) => (
            <DeploymentCard
              key={d.executionId}
              token={token}
              item={d}
              busy={busy === d.executionId}
              onCopy={copyEndpoint}
              onRedeploy={() => void handleRedeploy(d)}
              onKill={() => setConfirmKill(d)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmKill}
        onOpenChange={(o) => !o && setConfirmKill(null)}
        tone="destructive"
        title="Derribar despliegue"
        description={`Se detendrá y eliminará el model-service "${confirmKill?.containerName ?? ''}". Liberará su puerto y su cupo.`}
        confirmLabel="Derribar"
        onConfirm={() => {
          if (confirmKill) void handleKill(confirmKill)
        }}
      />
    </div>
  )
}

function statusBadge(item: DeploymentItem) {
  if (item.running) return <Badge variant="success">Activo</Badge>
  if (item.deployStatus === 'FAILED') return <Badge variant="destructive">Falló</Badge>
  return <Badge variant="secondary">Detenido</Badge>
}

interface DeploymentCardProps {
  token: string
  item: DeploymentItem
  busy: boolean
  onCopy: (endpoint: string) => void
  onRedeploy: () => void
  onKill: () => void
}

function DeploymentCard({ token, item, busy, onCopy, onRedeploy, onKill }: DeploymentCardProps) {
  const [predictOpen, setPredictOpen] = useState(false)
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-foreground" title={item.containerName ?? ''}>
            {item.containerName ?? '—'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {item.workspaceName}
            {item.modelVersion ? ` · v${item.modelVersion}` : ''}
          </p>
        </div>
        {statusBadge(item)}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Server className="size-3.5" /> Puerto <span className="font-mono text-foreground">{item.port ?? '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="size-3.5" /> Cold start{' '}
          <span className="font-mono text-foreground">{item.coldStartMs != null ? `${item.coldStartMs} ms` : '—'}</span>
        </div>
      </div>

      {item.endpoint && (
        <button
          type="button"
          onClick={() => onCopy(item.endpoint as string)}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent/40"
          title="Copiar endpoint /predict"
        >
          <Copy className="size-3.5 shrink-0 text-primary" />
          <span className="truncate font-mono text-foreground">{item.endpoint}/predict</span>
        </button>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onRedeploy}
          disabled={busy || !item.runId}
          loading={busy}
        >
          <Rocket />
          Redesplegar
        </Button>
        <Button variant="destructive" size="sm" className="flex-1" onClick={onKill} disabled={busy}>
          <Trash2 />
          Derribar
        </Button>
      </div>

      {item.running && (
        <>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setPredictOpen(true)}>
            <FlaskConical />
            Probar /predict
          </Button>
          <PredictModal
            token={token}
            executionId={item.executionId}
            containerName={item.containerName ?? 'model-service'}
            modelVersion={item.modelVersion}
            open={predictOpen}
            onOpenChange={setPredictOpen}
          />
        </>
      )}
    </div>
  )
}
