import { useMemo, useState, type ComponentType } from 'react'
import { Boxes, Eye, FlaskConical, Layers, RefreshCw, Rocket, ShieldCheck } from 'lucide-react'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet'
import { Spinner } from '@/shared/components/ui/spinner'
import { PageHeader } from '@/shared/components/PageHeader'
import { cn } from '@/lib/utils'
import { MlflowPanel } from '@/features/mlflow/components/MlflowPanel'
import { stageVariant, VersionCard, type RegistryApi } from '@/features/mlflow/components/ModelRegistry'
import { getMlflowModelVersions, getMlflowRunSummary, parseConfusion } from '@/features/mlflow/api'
import { useAdminRegistry, type StageKey } from '@/features/mlflow/useAdminRegistry'

interface MlflowPageProps {
  token: string
  onAuthError: (error: unknown) => boolean
}

interface KpiProps {
  title: string
  value: number | null
  icon: ComponentType<{ className?: string }>
  accent: string
  loading: boolean
}

function Kpi({ title, value, icon: Icon, accent, loading }: KpiProps) {
  return (
    <Card className="relative min-w-0 overflow-hidden">
      <div aria-hidden="true" className={cn('pointer-events-none absolute -top-6 -right-6 size-24 rounded-bl-[3rem]', accent)} />
      <CardContent className="relative">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</p>
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', accent.replace('/5', '/10'))}>
            <Icon className="size-5" />
          </div>
        </div>
        <div className="font-heading text-3xl font-bold tracking-tight text-foreground">
          {loading || value === null ? <span className="text-muted-foreground/40">—</span> : value.toLocaleString('es')}
        </div>
      </CardContent>
    </Card>
  )
}

const STAGE_META: Record<StageKey, { label: string; color: string }> = {
  Production: { label: 'Production', color: 'var(--success)' },
  Staging: { label: 'Staging', color: 'var(--warning)' },
  None: { label: 'None', color: 'var(--muted-foreground)' },
  Archived: { label: 'Archived', color: 'color-mix(in oklch, var(--muted-foreground) 60%, transparent)' },
}
const STAGE_ORDER: StageKey[] = ['Production', 'Staging', 'None', 'Archived']

export function MlflowPage({ token, onAuthError }: MlflowPageProps) {
  const reg = useAdminRegistry(token, onAuthError)
  const maxStage = Math.max(1, ...STAGE_ORDER.map((s) => reg.byStage[s]))
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const selected = useMemo(() => reg.rows.find((r) => r.name === selectedName) ?? null, [reg.rows, selectedName])

  // Registro global de gobierno: solo-lectura (DN-3). Detalles vía run-summary.
  const drawerApi: RegistryApi | null = useMemo(() => {
    if (!selected) return null
    return {
      listModels: async () => [],
      getVersions: (name) => getMlflowModelVersions(token, name),
      getMetrics: async (runId) => {
        const s = await getMlflowRunSummary(token, runId)
        const m = s.metrics
        return {
          accuracy: m.test_accuracy ?? m.val_accuracy ?? m.accuracy ?? null,
          loss: m.test_loss ?? m.val_loss ?? m.loss ?? null,
        }
      },
      getDetails: async (_name, _version, runId) => {
        const s = await getMlflowRunSummary(token, runId)
        return { params: s.params ?? {}, metrics: s.metrics ?? {}, confusionMatrix: parseConfusion(s.tags) }
      },
      allowDeploy: false,
    }
  }, [token, selected])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registro global de modelos"
        subtitle="Vista a nivel plataforma de experimentos, modelos registrados y su estado en el Model Registry."
        badge={
          <Badge variant="info" className="gap-1.5">
            <ShieldCheck className="size-3.5" />
            Solo administradores
          </Badge>
        }
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => window.dispatchEvent(new CustomEvent('synapseops:refresh-mlflow'))}
            className="shrink-0"
          >
            <RefreshCw />
            Actualizar
          </Button>
        }
      />

      {/* KPIs de plataforma */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Kpi title="Modelos" value={reg.totalModels} icon={Boxes} accent="bg-primary/5 text-primary-strong" loading={reg.loading} />
        <Kpi title="En producción" value={reg.inProduction} icon={Rocket} accent="bg-success/5 text-success-strong" loading={reg.loading} />
        <Kpi title="Versiones" value={reg.totalVersions} icon={Layers} accent="bg-cta/5 text-cta-strong" loading={reg.loading} />
        <Kpi title="Experimentos" value={reg.experiments} icon={FlaskConical} accent="bg-violet-500/5 text-violet-600" loading={reg.loading} />
      </div>

      {/* Distribución por stage */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Distribución de versiones por stage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {reg.loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Calculando…</p>
          ) : (reg.totalVersions ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay versiones registradas.</p>
          ) : (
            STAGE_ORDER.map((s) => {
              const count = reg.byStage[s]
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm font-medium text-foreground">{STAGE_META[s].label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(count / maxStage) * 100}%`, background: STAGE_META[s].color }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-sm text-muted-foreground">{count}</span>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Modelos registrados (tabla + drawer de detalles) */}
      <Card className="py-0">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="flex items-center gap-2">
            <Boxes className="size-4 text-primary" /> Modelos registrados
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reg.loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Cargando modelos…
            </div>
          ) : reg.rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No hay modelos registrados en la plataforma.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    <th className="px-5 py-3">Modelo</th>
                    <th className="px-3 py-3">Versión</th>
                    <th className="px-3 py-3">Accuracy</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reg.rows.map((r) => (
                    <tr key={r.name} className="border-b border-border last:border-0 transition-colors duration-150 ease-out-quart hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                            <Boxes className="size-4" />
                          </div>
                          <span className="truncate font-semibold text-foreground">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-muted-foreground">v{r.latestVersion}</td>
                      <td className="px-3 py-3 font-mono font-semibold text-success-strong">
                        {r.latestAccuracy != null ? r.latestAccuracy.toFixed(4) : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={stageVariant(r.latestStage)}>{r.latestStage}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedName(r.name)}>
                          <Eye className="size-3.5" /> Ver detalles
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drawer de detalle (solo-lectura) */}
      <Sheet open={selectedName != null} onOpenChange={(open) => !open && setSelectedName(null)}>
        <SheetContent className="max-w-lg">
          {selected && drawerApi && (
            <>
              <SheetHeader>
                <SheetTitle className="truncate pr-8">{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.versions.length} versión{selected.versions.length === 1 ? '' : 'es'} · registro global (solo lectura)
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-3">
                {selected.versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este modelo no tiene versiones.</p>
                ) : (
                  [...selected.versions]
                    .sort((a, b) => Number(b.version) - Number(a.version))
                    .map((version) => (
                      <VersionCard
                        key={version.version}
                        api={drawerApi}
                        modelName={selected.name}
                        version={version}
                        onAuthError={onAuthError}
                        onChanged={() => {}}
                      />
                    ))
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>

      <MlflowPanel token={token} onAuthError={onAuthError} />
    </div>
  )
}
