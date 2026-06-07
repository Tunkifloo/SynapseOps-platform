import { type ChangeEvent, type ReactNode } from 'react'
import {
  Boxes,
  LayoutDashboard,
  Layers,
  LogOut,
  Network,
  Search,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

interface SessionUser {
  username: string
  name: string
  role: Role
}

type Section = 'dashboard' | 'workspaces' | 'builder' | 'models' | 'admin' | 'mlflow' | 'profile'

interface NavigationItem {
  key: Section
  label: string
  icon: LucideIcon
  path: string
}

interface AppShellProps {
  section: Section
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
    { key: 'dashboard', label: 'Resumen', icon: LayoutDashboard, path: '/dashboard' },
    { key: 'workspaces', label: 'Espacios de trabajo', icon: Layers, path: '/workspaces' },
    { key: 'builder', label: 'Lienzo', icon: Network, path: '/builder' },
    { key: 'models', label: 'Mis modelos', icon: Boxes, path: '/models' },
  ]

  const adminItems: NavigationItem[] =
    user?.role === 'ADMIN'
      ? [
          { key: 'admin', label: 'Usuarios', icon: Users, path: '/admin' },
          { key: 'mlflow', label: 'Registro de modelos', icon: Boxes, path: '/mlflow' },
        ]
      : []

  const displayName = user?.name || user?.username || 'Usuario'
  const avatarLetter = displayName.charAt(0).toUpperCase()
  const mobileItems = [...navigationItems, ...adminItems]

  const navButtonClass = (active: boolean) =>
    cn(
      'h-10 w-full justify-start gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
    )

  return (
    <div className="flex min-h-[100svh] w-full overflow-hidden bg-background font-sans text-foreground">
      {/* ── Sidebar (≥ lg) ─────────────────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar p-5 lg:flex xl:w-64">
        <div>
          <div className="mb-9 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <Workflow className="size-5" />
            </div>
            <h1 className="font-heading text-lg font-bold tracking-tight text-foreground xl:text-xl">
              Synapse<span className="text-primary">Ops</span>
            </h1>
          </div>

          <nav aria-label="Navegación principal" className="space-y-1">
            <p className="mb-3 px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Navegación
            </p>
            {navigationItems.map((item) => {
              const active = section === item.key
              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                  className={navButtonClass(active)}
                >
                  <item.icon className={active ? 'text-primary' : 'text-current'} />
                  {item.label}
                </Button>
              )
            })}

            {adminItems.length > 0 && (
              <div className="mt-7 border-t border-sidebar-border pt-7">
                <p className="mb-3 px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Administración
                </p>
                {adminItems.map((item) => {
                  const active = section === item.key
                  return (
                    <Button
                      key={item.key}
                      variant="ghost"
                      onClick={() => navigate(item.path)}
                      aria-current={active ? 'page' : undefined}
                      className={navButtonClass(active)}
                    >
                      <item.icon className={active ? 'text-primary' : 'text-current'} />
                      {item.label}
                    </Button>
                  )
                })}
              </div>
            )}
          </nav>
        </div>

        <div className="rounded-2xl border border-sidebar-border bg-card/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-success" aria-hidden="true" />
            <p className="text-[11px] font-semibold tracking-[0.08em] text-success uppercase">
              Sistema en línea
            </p>
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground" title={currentWorkspace}>
            {currentWorkspace}
          </p>
        </div>
      </aside>

      {/* ── Columna principal ──────────────────────────────────────────── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-md sm:px-5 lg:px-6">
          <div className="flex min-h-11 items-center gap-3 lg:justify-between">
            {/* Marca en header (solo móvil; en desktop vive en el sidebar) */}
            <div className="flex shrink-0 items-center gap-2 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                <Workflow className="size-5" />
              </div>
              <span className="hidden font-heading text-base font-bold tracking-tight sm:inline">
                Synapse<span className="text-primary">Ops</span>
              </span>
            </div>

            <div className="relative min-w-0 flex-1 md:max-w-[520px] lg:w-[520px] lg:flex-none">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Buscar espacios de trabajo o usuarios"
                placeholder="Buscar espacios de trabajo o usuarios…"
                value={searchQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
                className="h-10 pl-10 sm:h-11"
              />
            </div>

            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                aria-label="Ver mi perfil"
                aria-current={section === 'profile' ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-full p-1 pr-1.5 transition-colors hover:bg-muted sm:pr-2',
                  section === 'profile' && 'bg-muted'
                )}
              >
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary ring-1 ring-primary/25"
                  aria-hidden="true"
                >
                  {avatarLetter}
                </div>
                <div className="hidden min-w-0 text-left sm:block">
                  <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">@{user?.username ?? '—'}</p>
                </div>
              </button>

              <Badge variant={user?.role === 'ADMIN' ? 'info' : 'secondary'} className="hidden sm:inline-flex">
                {user?.role ?? '—'}
              </Badge>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onLogout()}
                aria-label="Cerrar sesión"
                className="shrink-0"
              >
                <LogOut />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </Button>
            </div>
          </div>

          {/* Navegación móvil (< lg) */}
          <nav
            aria-label="Navegación principal (móvil)"
            className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
          >
            {mobileItems.map((item) => {
              const active = section === item.key
              return (
                <Button
                  key={item.key}
                  variant={active ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                  className="shrink-0"
                >
                  <item.icon className={active ? 'text-primary' : 'text-current'} />
                  {item.label}
                </Button>
              )
            })}
          </nav>
        </header>

        <main className="relative flex-1 overflow-auto bg-background p-3 sm:p-5 lg:p-6">
          {/* Rejilla técnica sutil (tinte de borde del tema) */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:44px_44px]"
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
