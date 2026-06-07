import { useMemo, useState } from 'react'
import { Boxes, Eye } from 'lucide-react'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Spinner } from '@/shared/components/ui/spinner'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/shared/components/ui/sheet'
import {
  deleteWorkspaceModelVersion,
  getWorkspaceModelVersionDetails,
  getWorkspaceModelVersions,
  parseConfusion,
  transitionWorkspaceModelStage,
} from '@/features/mlflow/api'
import { stageVariant, VersionCard, type RegistryApi } from '@/features/mlflow/components/ModelRegistry'
import { useMyModels } from '@/features/mlflow/useMyModels'

interface MyModelsPageProps {
  token: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

const STAGES = ['None', 'Staging', 'Production', 'Archived'] as const

/**
 * "Mis modelos": tabla unificada de los artefactos versionados del usuario en
 * todos sus espacios (RBAC DN-3). Filtros por proyecto y stage; el detalle de
 * versiones (métricas + matriz de confusión + acciones) se abre en un drawer.
 */
export function MyModelsPage({ token, searchQuery, onAuthError }: MyModelsPageProps) {
  const { rows, workspaces, loading, error, reload } = useMyModels(token, onAuthError)
  const [wsFilter, setWsFilter] = useState<string>('all')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (wsFilter === 'all' || String(r.workspaceId) === wsFilter) &&
        (stageFilter === 'all' || r.latestStage === stageFilter) &&
        (!q || r.name.toLowerCase().includes(q) || r.workspaceName.toLowerCase().includes(q))
    )
  }, [rows, wsFilter, stageFilter, searchQuery])

  const selected = useMemo(() => rows.find((r) => r.key === selectedKey) ?? null, [rows, selectedKey])

  const drawerApi: RegistryApi | null = useMemo(() => {
    if (!selected) return null
    const wsId = selected.workspaceId
    return {
      listModels: async () => [],
      getVersions: (name) => getWorkspaceModelVersions(token, wsId, name),
      deleteVersion: (name, version) => deleteWorkspaceModelVersion(token, wsId, name, version),
      transitionStage: (name, version, stage) =>
        transitionWorkspaceModelStage(token, wsId, name, version, stage),
      getDetails: async (name, version) => {
        const s = await getWorkspaceModelVersionDetails(token, wsId, name, version)
        return { params: s.params ?? {}, metrics: s.metrics ?? {}, confusionMatrix: parseConfusion(s.tags) }
      },
      allowDeploy: true,
    }
  }, [token, selected])

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground xl:text-3xl">
            Mis modelos
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
            Artefactos versionados en MLflow de todos tus proyectos. Gestiona versiones, stage y despliegue.
          </p>
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={wsFilter} onValueChange={setWsFilter}>
          <SelectTrigger className="w-56" aria-label="Filtrar por proyecto">
            <SelectValue placeholder="Proyecto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44" aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(wsFilter !== 'all' || stageFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setWsFilter('all')
              setStageFilter('all')
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Tabla */}
      <Card className="py-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Cargando modelos…
            </div>
          ) : error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : visible.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
              <Boxes className="mb-3 size-9 text-muted-foreground/50" />
              <p className="text-base font-semibold text-foreground">
                {rows.length === 0 ? 'Sin modelos todavía' : 'Sin coincidencias'}
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {rows.length === 0
                  ? 'Entrena un pipeline para registrar tus primeros modelos.'
                  : 'Ajusta los filtros o la búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    <th className="px-5 py-3">Modelo</th>
                    <th className="px-3 py-3">Versión</th>
                    <th className="px-3 py-3">Proyecto</th>
                    <th className="px-3 py-3">Accuracy</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.key}
                      className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                            <Boxes className="size-4" />
                          </div>
                          <span className="truncate font-semibold text-foreground">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-muted-foreground">v{r.latestVersion}</td>
                      <td className="px-3 py-3">
                        <span className="truncate text-muted-foreground">{r.workspaceName}</span>
                      </td>
                      <td className="px-3 py-3 font-mono font-semibold text-success">
                        {r.latestAccuracy != null ? r.latestAccuracy.toFixed(4) : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={stageVariant(r.latestStage)}>{r.latestStage}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedKey(r.key)}>
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

      {/* Drawer de detalle */}
      <Sheet open={selectedKey != null} onOpenChange={(open) => !open && setSelectedKey(null)}>
        <SheetContent className="max-w-lg">
          {selected && drawerApi && (
            <>
              <SheetHeader>
                <SheetTitle className="truncate pr-8">{selected.name}</SheetTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="truncate">{selected.workspaceName}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {selected.versions.length} versión{selected.versions.length === 1 ? '' : 'es'}
                  </span>
                </div>
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
                        onChanged={reload}
                      />
                    ))
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
