import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import {
  Activity,
  Bell,
  Boxes,
  ChartColumn,
  CheckCircle2,
  CircleAlert,
  Database,
  FolderPlus,
  Info,
  LayoutDashboard,
  Layers,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Search,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { getMlflowHealth } from '@/features/mlflow/api'
import { API_BASE_URL } from '@/shared/api/env'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

interface SessionUser {
  username: string
  name: string
  role: Role
}

type Section = 'dashboard' | 'workspaces' | 'datasets' | 'builder' | 'models' | 'deployments' | 'monitoring' | 'analytics' | 'admin' | 'mlflow' | 'profile'

interface NavigationItem {
  key: Section
  label: string
  icon: LucideIcon
  path: string
}

interface AppShellProps {
  section: Section
  user: SessionUser | null
  token: string
  currentWorkspace: string
  searchQuery: string
  onSearchChange: (query: string) => void
  onLogout: () => Promise<void> | void
  children: ReactNode
}

const COLLAPSED_KEY = 'synapseops:sidebar-collapsed'
const WIDTH_KEY = 'synapseops:sidebar-width'
const MIN_WIDTH = 208
const MAX_WIDTH = 340
const COLLAPSED_WIDTH = 76

export function AppShell({
  section,
  user,
  token,
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
    { key: 'datasets', label: 'Gestión de Dataset', icon: Database, path: '/datasets' },
    { key: 'deployments', label: 'Despliegues', icon: Rocket, path: '/deployments' },
    { key: 'monitoring', label: 'Monitoreo', icon: Activity, path: '/monitoring' },
  ]
  const adminItems: NavigationItem[] =
    user?.role === 'ADMIN'
      ? [
          { key: 'admin', label: 'Usuarios', icon: Users, path: '/admin' },
          { key: 'mlflow', label: 'Registro de modelos', icon: Boxes, path: '/mlflow' },
          { key: 'analytics', label: 'Analítica', icon: ChartColumn, path: '/analytics' },
        ]
      : []

  const displayName = user?.name || user?.username || 'Usuario'
  const avatarLetter = displayName.charAt(0).toUpperCase()
  const mobileItems = [...navigationItems, ...adminItems]

  // ── Sidebar: colapsable + redimensionable (persistido) ─────────────────────
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSED_KEY) === '1')
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : 248
  })
  const [resizing, setResizing] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const asideWidth = collapsed ? COLLAPSED_WIDTH : width

  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setResizing(true)
    const onMove = (e: MouseEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
      setWidth(next)
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setWidth((w) => {
        localStorage.setItem(WIDTH_KEY, String(w))
        return w
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const navButtonClass = (active: boolean) =>
    cn(
      'h-10 w-full gap-3 rounded-lg border-l-[3px] text-sm font-medium transition-colors',
      collapsed ? 'justify-center px-0' : 'justify-start px-3',
      active
        ? 'border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground'
        : 'border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
    )

  const renderNav = (items: NavigationItem[]) =>
    items.map((item) => {
      const active = section === item.key
      return (
        <Button
          key={item.key}
          variant="ghost"
          onClick={() => navigate(item.path)}
          aria-current={active ? 'page' : undefined}
          title={collapsed ? item.label : undefined}
          className={navButtonClass(active)}
        >
          <item.icon className={active ? 'text-sidebar-primary' : 'text-current'} />
          {!collapsed && item.label}
        </Button>
      )
    })

  return (
    <div className="flex h-[100svh] w-full overflow-hidden bg-background font-sans text-foreground">
      {/* ── Sidebar (≥ lg) ─────────────────────────────────────────────── */}
      <aside
        style={{ width: asideWidth }}
        className={cn(
          'relative hidden h-full shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar lg:flex',
          resizing ? 'select-none' : 'transition-[width] duration-200'
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className={cn('mb-7 flex items-center gap-2', collapsed ? 'justify-center' : 'justify-between px-1')}>
            {collapsed ? (
              <Brand size="md" showWordmark={false} />
            ) : (
              <Brand size="lg" tone="invert" subtitle />
            )}
            {!collapsed && (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Colapsar barra lateral"
                className="rounded-lg p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <PanelLeftClose className="size-4" />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expandir barra lateral"
              className="mb-3 flex w-full justify-center rounded-lg p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}

          <nav aria-label="Navegación principal" className="space-y-1">
            {!collapsed && (
              <p className="mb-3 px-1 text-[11px] font-semibold tracking-[0.14em] text-sidebar-foreground/55 uppercase">
                Navegación
              </p>
            )}
            {renderNav(navigationItems)}

            {adminItems.length > 0 && (
              <div className="mt-7 border-t border-sidebar-border pt-7">
                {!collapsed && (
                  <p className="mb-3 px-1 text-[11px] font-semibold tracking-[0.14em] text-sidebar-foreground/55 uppercase">
                    Administración
                  </p>
                )}
                {renderNav(adminItems)}
              </div>
            )}
          </nav>
        </div>

        {/* Card de usuario (→ perfil) + cerrar sesión, al pie del sidebar */}
        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-current={section === 'profile' ? 'page' : undefined}
            title={collapsed ? displayName : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent',
              collapsed && 'justify-center',
              section === 'profile' && 'bg-sidebar-accent'
            )}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary ring-1 ring-primary/25">
              {avatarLetter}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{displayName}</p>
                <p className="truncate text-xs text-sidebar-foreground/70">@{user?.username ?? '—'}</p>
              </div>
            )}
            {!collapsed && (
              <Badge variant={user?.role === 'ADMIN' ? 'info' : 'secondary'} className="shrink-0">
                {user?.role ?? '—'}
              </Badge>
            )}
          </button>
          <Button
            variant="ghost"
            onClick={() => setConfirmLogout(true)}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={cn(
              'mt-1 h-9 w-full gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed ? 'justify-center px-0' : 'justify-start px-2'
            )}
          >
            <LogOut className="size-4" />
            {!collapsed && 'Cerrar sesión'}
          </Button>
        </div>

        {/* Asa de redimensionado */}
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startResize}
            className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-sidebar-primary/40"
            title="Arrastra para redimensionar"
          />
        )}
      </aside>

      {/* ── Columna principal ──────────────────────────────────────────── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-md sm:px-5 lg:px-6">
          <div className="flex min-h-11 items-center gap-3 lg:justify-between">
            <Brand size="sm" showWordmark={false} className="shrink-0 lg:hidden" />

            <CommandSearch
              role={user?.role}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
              navigate={navigate}
            />

            <div className="ml-auto flex items-center gap-2">
              <NotificationsBell token={token} role={user?.role} />

              {/* Acceso a perfil/logout en móvil (en desktop viven en el sidebar) */}
              <button
                type="button"
                onClick={() => navigate('/profile')}
                aria-label="Ver mi perfil"
                className="flex size-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary ring-1 ring-primary/25 lg:hidden"
              >
                {avatarLetter}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmLogout(true)}
                aria-label="Cerrar sesión"
                className="lg:hidden"
              >
                <LogOut />
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
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:44px_44px]"
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        tone="default"
        title="Cerrar sesión"
        description="¿Estás seguro que deseas cerrar tu sesión?"
        confirmLabel="Cerrar sesión"
        onConfirm={() => onLogout()}
      />
    </div>
  )
}

// ── Búsqueda tipo command-palette ──────────────────────────────────────────────
interface CommandAction {
  label: string
  hint: string
  keywords: string
  icon: LucideIcon
  path: string
}

function CommandSearch({
  role,
  searchQuery,
  onSearchChange,
  navigate,
}: {
  role?: Role
  searchQuery: string
  onSearchChange: (q: string) => void
  navigate: (path: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const actions: CommandAction[] = useMemo(() => {
    const base: CommandAction[] = [
      { label: 'Resumen', hint: 'Ir al dashboard', keywords: 'dashboard inicio resumen', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'Espacios de trabajo', hint: 'Ver proyectos', keywords: 'workspaces proyectos espacios', icon: Layers, path: '/workspaces' },
      { label: 'Crear nuevo espacio', hint: 'Nuevo proyecto', keywords: 'crear nuevo proyecto espacio', icon: FolderPlus, path: '/workspaces' },
      { label: 'Lienzo', hint: 'Constructor de pipelines', keywords: 'lienzo pipeline canvas builder entrenar', icon: Network, path: '/builder' },
      { label: 'Mis modelos', hint: 'Modelos entrenados', keywords: 'modelos models registry desplegar', icon: Boxes, path: '/models' },
      { label: 'Gestión de Dataset', hint: 'Datasets y almacenamiento', keywords: 'datasets dataset datos archivos almacenamiento storage', icon: Database, path: '/datasets' },
      { label: 'Despliegues', hint: 'Model-services activos', keywords: 'despliegues deployments predict inferencia endpoint', icon: Rocket, path: '/deployments' },
      { label: 'Monitoreo', hint: 'Telemetría de tus proyectos', keywords: 'monitoreo monitoring telemetria metricas drift calidad', icon: Activity, path: '/monitoring' },
      { label: 'Mi perfil', hint: 'Cuenta y contraseña', keywords: 'perfil cuenta contraseña', icon: UserRound, path: '/profile' },
    ]
    if (role === 'ADMIN') {
      base.push(
        { label: 'Usuarios', hint: 'Gestión de usuarios', keywords: 'usuarios admin gestion', icon: Users, path: '/admin' },
        { label: 'Crear usuario', hint: 'Nuevo estudiante', keywords: 'crear usuario estudiante', icon: UserPlus, path: '/admin' },
        { label: 'Registro de modelos', hint: 'Model Registry de MLflow', keywords: 'registro global mlflow modelos registry', icon: Boxes, path: '/mlflow' },
        { label: 'Analítica', hint: 'Telemetría de la plataforma', keywords: 'analitica analytics telemetria global plataforma admin', icon: ChartColumn, path: '/analytics' }
      )
    }
    return base
  }, [role])

  const q = searchQuery.trim().toLowerCase()
  const matches = useMemo(
    () =>
      q
        ? actions.filter((a) => a.label.toLowerCase().includes(q) || a.keywords.includes(q)).slice(0, 6)
        : [],
    [actions, q]
  )
  const open = focused && q.length > 0 && matches.length > 0

  const go = (path: string) => {
    navigate(path)
    onSearchChange('')
    setFocused(false)
  }

  return (
    <div className="relative min-w-0 flex-1 md:max-w-[520px] lg:w-[520px] lg:flex-none">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-label="Buscar acciones, espacios o usuarios"
        placeholder="Busca acciones, proyectos o usuarios…"
        value={searchQuery}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          onSearchChange(e.target.value)
          setActiveIndex(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => (i + 1) % matches.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => (i - 1 + matches.length) % matches.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const target = matches[activeIndex]
            if (target) go(target.path)
          } else if (e.key === 'Escape') {
            setFocused(false)
          }
        }}
        className="h-10 pl-10 sm:h-11"
      />

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-full overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl ring-1 ring-foreground/10">
          <p className="px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Acciones
          </p>
          {matches.map((a, i) => (
            <button
              key={`${a.path}-${a.label}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                go(a.path)
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
              )}
            >
              <a.icon className="size-4 shrink-0 text-primary" />
              <span className="flex-1 font-medium text-foreground">{a.label}</span>
              <span className="text-xs text-muted-foreground">{a.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Campana de notificaciones (healthcheck + eventos del lienzo) ────────────────
interface NotifItem {
  id: number
  level: string
  message: string
  time: string
  terminal: boolean
}

function NotificationsBell({ token, role }: { token: string; role?: Role }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotifItem[]>([])
  const [unread, setUnread] = useState(0)
  const [health, setHealth] = useState<'up' | 'down' | 'unknown'>('unknown')
  const idRef = useRef(0)
  // Hitos ya notificados (clave = ejecución::nivel::mensaje). PERSISTE entre suscripciones
  // SSE: al cambiar de workspace en el lienzo y volver se re-suscribe y el backend reenvía
  // el historial (replay); sin esto, los mismos hitos se re-notificarían como "no leídos".
  const seenRef = useRef<Set<string>>(new Set())
  // El healthcheck (MLflow) es de alcance ADMIN; para colaboradores se omite.
  const canCheckHealth = role === 'ADMIN'

  const addNotif = useCallback((level: string, message: string, terminal: boolean) => {
    idRef.current += 1
    const item: NotifItem = {
      id: idRef.current,
      level,
      message,
      time: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
      terminal,
    }
    setItems((prev) => [item, ...prev].slice(0, 30))
    setUnread((u) => u + 1)
  }, [])

  // Fuente externa genérica: cualquier módulo puede emitir 'synapseops:notify'.
  useEffect(() => {
    const handler = (event: Event) => {
      const d = (event as CustomEvent).detail as { level: string; message: string; terminal: boolean }
      if (d) addNotif(d.level, d.message, !!d.terminal)
    }
    window.addEventListener('synapseops:notify', handler)
    return () => window.removeEventListener('synapseops:notify', handler)
  }, [addNotif])

  // ── Suscriptor SSE PERSISTENTE de la ejecución activa ───────────────────────
  // Vive en AppShell (siempre montado) → notifica ingesta/entrenamiento/despliegue
  // AUNQUE el usuario esté en otro módulo, y DEDUPLICA el replay (no re-notifica al
  // volver al lienzo). El lienzo difunde la ejecución vía 'synapseops:active-execution'.
  const [activeExec, setActiveExec] =
    useState<{ executionId: number; workspaceId: number; pipelineId: number } | null>(null)
  useEffect(() => {
    const handler = (event: Event) => {
      const d = (event as CustomEvent).detail as
        | { executionId: number; workspaceId: number; pipelineId: number }
        | null
      // Ignora re-emisiones de la MISMA ejecución (evita re-suscribir y re-notificar).
      setActiveExec((prev) => (prev?.executionId === d?.executionId ? prev : d))
    }
    window.addEventListener('synapseops:active-execution', handler)
    return () => window.removeEventListener('synapseops:active-execution', handler)
  }, [])

  useEffect(() => {
    if (!activeExec || !token) return
    const execId = activeExec.executionId
    const url =
      `${API_BASE_URL}/workspaces/${activeExec.workspaceId}/pipelines/${activeExec.pipelineId}` +
      `/executions/${execId}/logs?token=${encodeURIComponent(token)}`
    const source = new EventSource(url)
    source.addEventListener('log', (event: Event) => {
      try {
        const d = JSON.parse((event as MessageEvent).data) as
          { level: string; message: string; terminal?: boolean }
        const m = (d.message ?? '').toLowerCase()
        // Hitos a notificar: ingesta lista, entrenamiento completado, despliegue
        // exitoso, y cualquier error/fallo o evento terminal.
        const milestone =
          d.level === 'ERROR' || m.includes('fallid') ||
          m.includes('dataset listo') ||
          m.includes('entrenamiento completado') ||
          m.includes('desplegado y healthy') ||
          !!d.terminal
        if (!milestone) return
        // Clave por EJECUCIÓN: persiste entre suscripciones → el replay al volver al
        // lienzo no re-notifica hitos ya vistos de esa misma ejecución.
        const key = `${execId}::${d.level}::${d.message}`
        if (seenRef.current.has(key)) return
        seenRef.current.add(key)
        addNotif(d.level, d.message, !!d.terminal)
      } catch { /* evento no parseable: ignorar */ }
    })
    // Sin cerrar en onerror: EventSource reconecta solo; el seen-set evita duplicados.
    return () => source.close()
  }, [activeExec, token, addNotif])

  const checkHealth = useCallback(async () => {
    if (!canCheckHealth) return
    try {
      const h = await getMlflowHealth(token)
      setHealth(h.status === 'UP' ? 'up' : 'down')
    } catch {
      setHealth('unknown')
    }
  }, [token, canCheckHealth])

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  const toggle = () => {
    setOpen((o) => {
      const next = !o
      if (next) {
        setUnread(0)
        void checkHealth()
      }
      return next
    })
  }

  const levelIcon = (item: NotifItem) => {
    if (item.level === 'ERROR') return <CircleAlert className="size-4 text-destructive" />
    if (item.level === 'WARN') return <CircleAlert className="size-4 text-warning" />
    if (item.terminal) return <CheckCircle2 className="size-4 text-success" />
    return <Info className="size-4 text-info" />
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Notificaciones" className="relative">
        <Bell />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-cta text-[10px] font-bold text-cta-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-xl ring-1 ring-foreground/10">
            {/* Cabecera: healthcheck (ADMIN) o título de notificaciones */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                {canCheckHealth ? (
                  <>
                    <span
                      className={cn(
                        'size-2.5 rounded-full',
                        health === 'up' ? 'bg-success' : health === 'down' ? 'bg-destructive' : 'bg-muted-foreground'
                      )}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-foreground">
                      {health === 'up'
                        ? 'Sistema operativo'
                        : health === 'down'
                          ? 'Servicio no disponible'
                          : 'Estado desconocido'}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-foreground">Notificaciones</span>
                )}
              </div>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Notificaciones */}
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <Bell className="mx-auto mb-2 size-6 text-muted-foreground/40" />
                  Sin notificaciones. Los eventos de tus ejecuciones aparecerán aquí.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 shrink-0">{levelIcon(item)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">{item.message}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.time}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
