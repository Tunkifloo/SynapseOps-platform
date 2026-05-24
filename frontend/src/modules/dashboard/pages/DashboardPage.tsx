import { Layers, Database, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listMyWorkspaces } from '@/features/workspaces/api'
import type { WorkspaceSummary } from '@/features/workspaces/types'
import { EmptyState } from '@/shared/components/EmptyState'
import { SectionTitle } from '@/shared/components/SectionTitle'
import type { Role } from '@/types'

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="bg-white/[0.03] border-white/5 backdrop-blur-xl hover:bg-white/[0.05] transition-all">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
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
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setIsLoading(true)
      try {
        const data = await listMyWorkspaces(token)
        if (!cancelled) {
          setWorkspaces(data)
          setError(null)
        }
      } catch (error) {
        if (cancelled || onAuthError(error)) {
          return
        }
        setError(error instanceof Error ? error.message : 'No se pudieron cargar los workspaces.')
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [onAuthError, token])

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Overview" title="Operational Workspace Snapshot" description="Vista general del alcance actual de la sesión autenticada y acceso rápido a las áreas principales." />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard title="My Workspaces" value={isLoading ? '...' : String(workspaces.length)} />
        <StatCard title="Current Role" value={role ?? 'N/A'} />
        <StatCard title="Current Workspace" value={currentWorkspace || 'None'} />
      </div>

      {error && <EmptyState title="Workspace overview unavailable" message={error} />}

      {!error && (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card className="border-white/5 bg-white/[0.03]">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-white">My Workspaces</CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate('/workspaces')}>Open Workspaces</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && <p className="text-sm text-slate-400">Loading workspaces...</p>}
              {!isLoading && workspaces.length === 0 && <p className="text-sm text-slate-400">No workspaces available for this session.</p>}
              {!isLoading && workspaces.slice(0, 4).map((item) => (
                <div key={item.idWorkspace} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-400" />
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{item.description || 'No description available.'}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Owner: {item.ownerUsername}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-white">Next Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-400">
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 h-4 w-4 text-emerald-400" />
                <p>Crea proyectos aislados, carga dataset por workspace y administra pipelines del proyecto seleccionado.</p>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-4 w-4 text-blue-400" />
                <p>Si tu rol es ADMIN, también tienes acceso al panel administrativo desde la navegación lateral.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
