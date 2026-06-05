import { type ChangeEvent, type ReactNode } from 'react'
import {
  Activity,
  Grid2X2,
  Layers,
  LogOut,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import type { Role } from '@/types'

interface SessionUser {
  username: string
  name: string
  role: Role
}

interface NavigationItem {
  key: string
  label: string
  icon: LucideIcon
  path: string
}

interface AppShellProps {
  section: 'dashboard' | 'workspaces' | 'admin' | 'mlflow'
  user: SessionUser | null
  currentWorkspace: string
  searchQuery: string
  onSearchChange: (query: string) => void
  onLogout: () => Promise<void> | void
  children: ReactNode
}

export function AppShell({
  section,
  user,
  currentWorkspace,
  searchQuery,
  onSearchChange,
  onLogout,
  children,
}: AppShellProps) {
  const navigate = useNavigate()

  const navigationItems: NavigationItem[] = [
    { key: 'dashboard', label: 'Resumen', icon: Grid2X2, path: '/dashboard' },
    { key: 'workspaces', label: 'Mis proyectos', icon: Layers, path: '/workspaces' },
  ]

  const adminItems: NavigationItem[] = user?.role === 'ADMIN'
    ? [
        { key: 'admin', label: 'Usuarios admin', icon: Users, path: '/admin' },
        { key: 'mlflow', label: 'Registro de modelos', icon: Activity, path: '/mlflow' },
      ]
    : []

  const displayName = user?.name || user?.username || 'superadmin'
  const avatarLetter = displayName.charAt(0).toUpperCase()
  const mobileItems = [...navigationItems, ...adminItems]

  return (
    <div className="flex min-h-[100svh] w-full overflow-hidden bg-[#070d18] font-sans text-slate-400">
      <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-slate-800/80 bg-[#08111f] p-5 lg:flex xl:w-64">
        <div>
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/15 text-blue-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-50 xl:text-xl">
              Synapse<span className="text-blue-400">Ops</span>
            </h2>
          </div>

          <nav className="space-y-1">
            <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Navegación
            </p>
            {navigationItems.map((item) => {
              const active = section === item.key
              return (
                <Button
                  key={item.key}
                  onClick={() => navigate(item.path)}
                  variant="ghost"
                  className={`h-10 w-full justify-start rounded-lg px-3 transition-colors ${
                    active
                      ? 'border border-blue-500/20 bg-blue-500/15 text-slate-50'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-50'
                  }`}
                >
                  <item.icon className={`mr-3 h-4 w-4 ${active ? 'text-blue-400' : 'text-slate-300'}`} />
                  <span className="text-xs font-medium xl:text-sm">{item.label}</span>
                </Button>
              )
            })}

            {adminItems.length > 0 && (
              <div className="mt-7 border-t border-slate-800/80 pt-7">
                <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Administración
                </p>
                {adminItems.map((item) => {
                  const active = section === item.key
                  return (
                    <Button
                      key={item.key}
                      onClick={() => navigate(item.path)}
                      variant="ghost"
                      className={`h-10 w-full justify-start rounded-lg px-3 transition-colors ${
                        active
                          ? 'border border-blue-500/20 bg-blue-500/15 text-slate-50'
                          : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-50'
                      }`}
                    >
                      <item.icon className={`mr-3 h-4 w-4 ${active ? 'text-blue-400' : 'text-slate-300'}`} />
                      <span className="text-xs font-medium xl:text-sm">{item.label}</span>
                    </Button>
                  )
                })}
              </div>
            )}
          </nav>
        </div>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/55 p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-400">
              SISTEMA EN LÍNEA
            </p>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Espacio: {currentWorkspace}
          </p>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#070d18]/95 px-3 py-3 backdrop-blur-md sm:px-5 lg:px-6">
          <div className="flex min-h-11 items-center gap-3 lg:justify-between">
            <div className="relative min-w-0 flex-1 md:max-w-[520px] lg:w-[520px] lg:flex-none">
              <Search className="absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Buscar espacios de trabajo o usuarios..."
                value={searchQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
                className="h-10 rounded-full border-slate-700/80 bg-slate-950/50 pl-11 text-sm text-slate-200 placeholder:text-slate-500 focus-visible:border-blue-500/50 focus-visible:ring-blue-500/20 sm:h-11"
              />
            </div>

            <div className="hidden min-w-0 items-center gap-3 md:ml-auto md:flex">
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-semibold text-slate-50">{displayName}</p>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
                  {user?.role ?? 'ADMIN'} · EN LÍNEA
                </p>
              </div>
            </div>

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-400/20 bg-blue-500/25 text-sm font-semibold text-blue-100">
              {avatarLetter}
            </div>

            <div className="hidden h-9 w-px bg-slate-800 sm:block" />
            <Button
              onClick={() => void onLogout()}
              variant="ghost"
              className="h-9 shrink-0 px-2 text-slate-300 hover:bg-slate-800/70 hover:text-slate-50 sm:px-3"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden text-sm font-medium sm:inline">Cerrar sesión</span>
            </Button>
          </div>

          <div className="mt-2 min-w-0 md:hidden">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-50">{displayName}</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500">
                {user?.role ?? 'ADMIN'} · EN LÍNEA
              </p>
            </div>
          </div>

          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            {mobileItems.map((item) => {
              const active = section === item.key
              return (
                <Button
                  key={item.key}
                  onClick={() => navigate(item.path)}
                  variant="ghost"
                  className={`h-9 shrink-0 rounded-full border px-3 text-xs transition-colors ${
                    active
                      ? 'border-blue-500/30 bg-blue-500/15 text-slate-50'
                      : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:bg-slate-800/70 hover:text-slate-50'
                  }`}
                >
                  <item.icon className={`mr-2 h-3.5 w-3.5 ${active ? 'text-blue-400' : 'text-slate-400'}`} />
                  {item.label}
                </Button>
              )
            })}
          </nav>
        </header>

        <main className="relative flex-1 overflow-auto bg-[#070d18] p-3 sm:p-5 lg:p-6">
          <div className="pointer-events-none absolute inset-0 opacity-35 bg-[linear-gradient(to_right,rgba(51,65,85,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.14)_1px,transparent_1px)] bg-[size:44px_44px]" />
          <div className="relative z-10 w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
