import { type ComponentType, useEffect, useState } from 'react'
import { Database, FolderOpen, Layers, Shield, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { listMyWorkspaces } from '@/features/workspaces/api'
import type { WorkspaceSummary } from '@/features/workspaces/types'
import { EmptyState } from '@/shared/components/EmptyState'
import { useAppStore } from '@/store/useAppStore'
import type { Role } from '@/types'

interface StatCardProps {
  title: string
  value: string
  icon: ComponentType<{ className?: string }>
}

function StatCard({ title, value, icon: Icon }: StatCardProps) {
  return (
    <Card className="min-w-0 rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
      <CardContent className="flex min-w-0 items-center gap-3 p-4 sm:gap-4 xl:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 text-blue-400 sm:h-11 sm:w-11 xl:h-12 xl:w-12">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-[11px]">
            {title}
          </p>
          <div className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-50 sm:text-xl xl:text-2xl">
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface DashboardPageProps {
  token: string
  role?: Role
  currentWorkspace: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

export function DashboardPage({ token, role, currentWorkspace, onAuthError }: DashboardPageProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const setWorkspace = useAppStore((state) => state.setWorkspace)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setIsLoading(true)
      try {
        const data = await listMyWorkspaces(token)
        if (!cancelled) {
          setWorkspaces(data)
          if ((currentWorkspace === 'Default Project' || !currentWorkspace) && data[0]) {
            setWorkspace(data[0].name)
          }
          setError(null)
        }
      } catch (error) {
        if (cancelled || onAuthError(error)) {
          return
        }
        setError(error instanceof Error ? error.message : 'No se pudieron cargar los espacios de trabajo.')
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentWorkspace, onAuthError, setWorkspace, token])

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      <section>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl xl:text-3xl">
          Resumen del espacio operativo
        </h1>
        <p className="mt-1.5 max-w-4xl text-sm leading-6 text-slate-400 xl:text-base">
          Vista general del alcance actual de la sesión autenticada y acceso rápido a las áreas principales.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        <StatCard
          title="Mis espacios de trabajo"
          value={isLoading ? '...' : String(workspaces.length)}
          icon={Layers}
        />
        <StatCard title="Rol actual" value={role ?? 'N/A'} icon={UserRound} />
        <StatCard title="Espacio actual" value={currentWorkspace || 'Ninguno'} icon={Database} />
      </div>

      {error && <EmptyState title="Resumen no disponible" message={error} />}

      {!error && (
        <div className="grid items-start gap-3 sm:gap-4 xl:grid-cols-[1.05fr_1fr]">
          <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
            <CardHeader className="flex flex-col items-start justify-between gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:px-5 sm:pt-5">
              <CardTitle className="text-lg font-semibold text-slate-50 xl:text-xl">
                Mis espacios de trabajo
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/workspaces')}
                className="w-full border-blue-500/30 bg-blue-500/5 text-slate-200 hover:bg-blue-500/10 hover:text-slate-50 sm:w-auto"
              >
                <FolderOpen className="mr-2 h-4 w-4 text-blue-400" />
                Abrir espacios
              </Button>
            </CardHeader>

            <CardContent className="space-y-2.5 p-4 pt-3 sm:p-5 sm:pt-4">
              {isLoading && <p className="text-sm text-slate-500">Cargando espacios...</p>}
              {!isLoading && workspaces.length === 0 && (
                <p className="text-sm text-slate-500">No hay espacios disponibles para esta sesión.</p>
              )}
              {!isLoading && workspaces.slice(0, 4).map((item) => (
                <div
                  key={item.idWorkspace}
                  className="min-w-0 rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 transition-colors hover:border-slate-700 hover:bg-slate-900/60 sm:p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-400/10 bg-blue-500/10 text-blue-400">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-slate-50 sm:truncate xl:text-base">{item.name}</p>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-1 text-sm leading-5 text-slate-400">{item.description}</p>
                      )}
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Owner: {item.ownerUsername}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-800/90 bg-slate-900/55 py-0 shadow-sm shadow-black/20">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
              <CardTitle className="text-lg font-semibold text-slate-50 xl:text-xl">
                Próximas acciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-3 sm:p-5 sm:pt-4">
              <div className="flex gap-3">
                <Database className="mt-1 h-5 w-5 shrink-0 text-emerald-400" />
                <p className="max-w-xl text-sm leading-6 text-slate-400">
                  Crea proyectos aislados, carga dataset por workspace y administra pipelines del proyecto seleccionado.
                </p>
              </div>
              <div className="flex gap-3">
                <Shield className="mt-1 h-5 w-5 shrink-0 text-blue-400" />
                <p className="max-w-xl text-sm leading-6 text-slate-400">
                  Si tu rol es ADMIN, también tienes acceso al panel administrativo desde la navegación lateral.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
