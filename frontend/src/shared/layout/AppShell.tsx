import { type ChangeEvent, type ReactNode } from 'react'
import { Activity, Layers, LogOut, Search, User as UserIcon, Users, type LucideIcon } from 'lucide-react'
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

export function AppShell({ section, user, currentWorkspace, searchQuery, onSearchChange, onLogout, children }: AppShellProps) {
  const navigate = useNavigate()

  const navigationItems: NavigationItem[] = [
    { key: 'dashboard',   label: 'Overview',     icon: Search, path: '/dashboard'   },
    { key: 'workspaces',  label: 'My Projects',  icon: Layers, path: '/workspaces'  },
  ]

  const adminItems: NavigationItem[] = user?.role === 'ADMIN'
      ? [
        { key: 'admin',   label: 'Admin Users',    icon: Users,    path: '/admin'   },
        { key: 'mlflow',  label: 'Model Registry', icon: Activity, path: '/mlflow'  },
      ]
      : []

  return (
      <div className="flex h-screen w-full overflow-hidden bg-[#050505] font-sans text-slate-400">
        <aside className="flex w-64 flex-col justify-between border-r border-white/5 bg-[#0a0a0a] p-6">
          <div>
            <div className="mb-10 flex items-center gap-3 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-emerald-400 shadow-lg shadow-blue-500/20">
                <Search className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-xl font-bold tracking-tight italic text-white">
                Synapse<span className="text-blue-500">Ops</span>
              </h2>
            </div>

            <nav className="space-y-1">
              <p className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
                Workspace Core
              </p>
              {navigationItems.map((item) => (
                  <Button
                      key={item.key}
                      onClick={() => navigate(item.path)}
                      variant="ghost"
                      className={`w-full justify-start rounded-xl px-2 transition-all ${
                          section === item.key
                              ? 'bg-blue-500/10 text-white'
                              : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    <item.icon className="mr-3 h-4 w-4 text-blue-400" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Button>
              ))}

              {adminItems.length > 0 && (
                  <div className="mt-8 border-t border-white/5 pt-8">
                    <p className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">
                      Admin Management
                    </p>
                    {adminItems.map((item) => (
                        <Button
                            key={item.key}
                            onClick={() => navigate(item.path)}
                            variant="ghost"
                            className={`w-full justify-start rounded-xl px-2 transition-all ${
                                section === item.key
                                    ? 'bg-blue-500/10 text-white'
                                    : 'text-slate-400 hover:bg-blue-500/10 hover:text-white'
                            }`}
                        >
                          <item.icon className="mr-3 h-4 w-4 text-blue-500" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </Button>
                    ))}
                  </div>
              )}
            </nav>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/5 bg-gradient-to-tr from-blue-600/10 to-emerald-500/5 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></div>
                <p className="text-[10px] font-bold uppercase text-emerald-400">System Live</p>
              </div>
              <p className="text-[10px] font-mono leading-relaxed text-slate-500">
                Workspace: {currentWorkspace}
              </p>
            </div>
          </div>
        </aside>

        <div className="relative flex flex-1 flex-col">
          <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-white/5 bg-[#050505]/60 px-8 backdrop-blur-md">
            <div className="flex flex-1 items-center gap-4">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-600" />
                <Input
                    placeholder="Search workspaces or users..."
                    value={searchQuery}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
                    className="rounded-full border-white/10 bg-white/5 pl-10 text-xs focus-visible:ring-blue-500/50"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs font-bold text-white">{user?.name || user?.username}</p>
                  <p className="text-[10px] font-medium uppercase tracking-tighter text-slate-500">
                    {user?.role} • Online
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-transparent p-0.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-slate-900">
                    <UserIcon className="h-5 w-5 text-blue-400" />
                  </div>
                </div>
              </div>

              <Button
                  onClick={() => void onLogout()}
                  variant="ghost"
                  className="text-red-400/70 hover:bg-red-400/10 hover:text-red-400"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span className="text-xs font-medium">Logout</span>
              </Button>
            </div>
          </header>

          <main className="relative flex-1 overflow-auto bg-[#050505] p-8">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            <div className="relative z-10">{children}</div>
          </main>
        </div>
      </div>
  )
}