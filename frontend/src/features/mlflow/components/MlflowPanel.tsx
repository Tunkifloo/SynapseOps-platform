import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { Activity, FlaskConical } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { cn } from '@/lib/utils'
import { getMlflowHealth, listMlflowExperiments, type MlflowExperiment } from '../api'

interface MlflowPanelProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

interface EmptyRegistryCardProps {
  title: string
  count: number
  icon: ComponentType<{ className?: string }>
  emptyTitle: string
  emptyText: string
  children?: ReactNode
}

function EmptyRegistryCard({ title, count, icon: Icon, emptyTitle, emptyText, children }: EmptyRegistryCardProps) {
  return (
    <Card className="py-0">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Icon className="size-5" />
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary-strong">{count}</span>
        </div>

        {count === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-5 text-center">
            <Icon className="mb-3 size-9 text-muted-foreground/60" />
            <p className="text-base font-semibold text-foreground">{emptyTitle}</p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

export function MlflowPanel({ token, onAuthError }: MlflowPanelProps) {
  const [health, setHealth] = useState<{ status: string; uri: string } | null>(null)
  const [experiments, setExperiments] = useState<MlflowExperiment[]>([])

  const loadAll = useCallback(async () => {
    try {
      const [h, exps] = await Promise.all([getMlflowHealth(token), listMlflowExperiments(token)])
      setHealth({ status: h.status, uri: h.uri })
      setExperiments(exps)
    } catch (err) {
      if (!onAuthError(err)) setExperiments([])
    }
  }, [token, onAuthError])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    void loadAll()
  }, [token, onAuthError])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    const refresh = () => {
      void loadAll()
    }
    window.addEventListener('synapseops:refresh-mlflow', refresh)
    return () => window.removeEventListener('synapseops:refresh-mlflow', refresh)
  }, [loadAll])

  const isUp = health?.status === 'UP'

  return (
    <div className="space-y-5">
      <Card className="py-0">
        <CardHeader className="px-6 pt-5">
          <div className="flex items-start gap-4">
            <Activity className={cn('mt-0.5 size-6', isUp ? 'text-success-strong' : 'text-muted-foreground')} />
            <div>
              <CardTitle className="text-xl">Servidor de seguimiento MLflow</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Estado del registro de experimentos y modelos.
                {health && (
                  <span className={cn('ml-2 font-semibold', isUp ? 'text-success-strong' : 'text-warning-strong')}>
                    {isUp ? 'Operativo' : 'No disponible'}
                  </span>
                )}
              </p>
              {health?.uri && <p className="mt-1 font-mono text-xs text-muted-foreground/70">{health.uri}</p>}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-6 pt-3">
          <EmptyRegistryCard
            title="Experimentos"
            count={experiments.length}
            icon={FlaskConical}
            emptyTitle="No hay experimentos registrados."
            emptyText="Los entrenamientos aparecerán aquí cuando se ejecuten desde un pipeline."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {experiments.map((experiment) => (
                <div
                  key={experiment.experimentId}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{experiment.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">id: {experiment.experimentId}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {experiment.lifecycleStage}
                  </span>
                </div>
              ))}
            </div>
          </EmptyRegistryCard>
        </CardContent>
      </Card>
    </div>
  )
}
