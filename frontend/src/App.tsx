import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { LoginPage } from './pages/LoginPage';
import { 
  Database, Cpu, Split, Brain, Rocket, User as UserIcon, Search, 
  Activity, Zap, Box, Layers, LogOut,
  type LucideIcon 
} from 'lucide-react';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Role } from './types';

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
}

const AUTH_BASE_URL = 'http://localhost:8080/api/v1/auth';
const API_BASE_URL = 'http://localhost:8080/api/v1';

interface ApiErrorLike {
  status: number;
  message: string;
}

interface ProblemDetail {
  detail?: string;
}

interface WorkspaceSummary {
  idWorkspace: number;
  name: string;
  description: string;
  ownerUsername: string;
}

interface UserSummary {
  idUser: number;
  username: string;
  name: string;
  email: string;
  role: Role;
}

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  children: ReactNode;
}

interface RoleRouteProps extends ProtectedRouteProps {
  role: Role;
  currentRole?: Role;
}

class ApiError extends Error implements ApiErrorLike {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isApiError = (error: unknown): error is ApiErrorLike => (
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  'message' in error
);

const getProblemDetail = async (response: Response) => {
  const problem = await response.json().catch(() => null) as ProblemDetail | null;
  return problem?.detail ?? `Request failed with status ${response.status}`;
};

const fetchJson = async <T,>(path: string, token: string) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await getProblemDetail(response));
  }

  return response.json() as Promise<T>;
};

function ProtectedRoute({ isAuthenticated, children }: ProtectedRouteProps) {
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ isAuthenticated, role, currentRole, children }: RoleRouteProps) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return currentRole === role ? children : <Navigate to="/forbidden" replace />;
}

function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-slate-300">
      <Card className="w-full max-w-lg border-white/10 bg-black/40 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold text-white">
            Acceso restringido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          <p className="text-sm text-slate-400">
            Tu perfil no tiene permisos para acceder a este modulo.
          </p>
          <p className="text-xs uppercase tracking-[0.3em] text-red-400">
            HTTP 403 Forbidden
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Card className="border-white/5 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-white">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-400">{message}</CardContent>
    </Card>
  );
}

function AdminCrudContent() {
  return null;
}

function DashboardHomeContent({
  workspace,
  role,
  token,
  onAuthError,
}: {
  workspace: string;
  role?: Role;
  token: string;
  onAuthError: (error: unknown) => boolean;
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaces = async () => {
      try {
        const endpoint = role === 'ADMIN' ? '/workspaces/all' : '/workspaces';
        const data = await fetchJson<WorkspaceSummary[]>(endpoint, token);

        if (!cancelled) {
          setWorkspaces(data);
          setError(null);
        }
      } catch (err) {
        if (cancelled || onAuthError(err)) {
          return;
        }

        setError(err instanceof Error ? err.message : 'No se pudieron cargar los workspaces.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, [onAuthError, role, token]);

  const title = role === 'ADMIN' ? 'Accessible Workspaces' : 'My Workspaces';

  return (
    <>
      <div className="relative z-10 grid grid-cols-1 gap-6 mb-8 md:grid-cols-3">
        <StatCard title={role === 'ADMIN' ? 'Global Workspaces' : 'My Workspaces'} value={isLoading ? '...' : String(workspaces.length)} icon={Layers} color="text-blue-500" />
        <StatCard title="Total Models" value="48" icon={Box} color="text-emerald-500" />
        <StatCard title="Requests/sec" value="1.2k" icon={Activity} color="text-orange-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="text-white">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400">Loading workspaces...</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!isLoading && !error && workspaces.length === 0 && (
              <p className="text-sm text-slate-400">No workspaces available for this session.</p>
            )}
            {!isLoading && !error && workspaces.map((item) => (
              <div key={item.idWorkspace} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">{item.name}</p>
                <p className="mt-1 text-xs text-slate-400">{item.description || 'No description available.'}</p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Owner: {item.ownerUsername}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="text-white">Session Scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-400">
            <p>
              {role === 'ADMIN'
                ? 'This dashboard can read the global workspace listing available to administrators.'
                : 'This dashboard is limited to the authenticated collaborator resources.'}
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-400">
              Active workspace: {workspace}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <h3 className="text-white/10 font-black text-8xl tracking-tighter mb-2 select-none">SYNAPSE</h3>
          <p className="text-[10px] text-slate-600 uppercase tracking-[0.8em]">Workspace: {workspace}</p>
        </div>
      </div>
    </>
  );
}

function AdminCrudPage({
  token,
}: {
  token: string;
}) {
  const logout = useAppStore((state) => state.logout);
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const handleAuthError = (err: unknown) => {
      if (!isApiError(err)) {
        return false;
      }

      if (err.status === 401) {
        logout();
        navigate('/login', { replace: true });
        return true;
      }

      if (err.status === 403) {
        navigate('/forbidden', { replace: true });
        return true;
      }

      return false;
    };

    const loadAdminData = async () => {
      try {
        const [usersData, workspacesData] = await Promise.all([
          fetchJson<UserSummary[]>('/users', token),
          fetchJson<WorkspaceSummary[]>('/workspaces/all', token),
        ]);

        if (!cancelled) {
          setUsers(usersData);
          setWorkspaces(workspacesData);
          setError(null);
        }
      } catch (err) {
        if (cancelled || handleAuthError(err)) {
          return;
        }

        setError(err instanceof Error ? err.message : 'No se pudo cargar el modulo administrativo.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [logout, navigate, token]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-blue-500">Admin Only</p>
        <h1 className="text-3xl font-bold text-white">Global CRUD Services</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Users" value={isLoading ? '...' : String(users.length)} icon={UserIcon} color="text-blue-500" />
        <StatCard title="Workspaces" value={isLoading ? '...' : String(workspaces.length)} icon={Layers} color="text-emerald-500" />
        <StatCard title="Pipelines" value="CRUD" icon={Brain} color="text-orange-500" />
      </div>

      {error && <EmptyState title="Admin module unavailable" message={error} />}

      {!error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-white/5 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-white">Global Users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && <p className="text-sm text-slate-400">Loading users...</p>}
              {!isLoading && users.length === 0 && (
                <p className="text-sm text-slate-400">No users returned by the API.</p>
              )}
              {!isLoading && users.slice(0, 5).map((item) => (
                <div key={item.idUser} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">{item.name || item.username}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.email}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-blue-400">{item.role}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-white">Global Workspaces</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && <p className="text-sm text-slate-400">Loading workspaces...</p>}
              {!isLoading && workspaces.length === 0 && (
                <p className="text-sm text-slate-400">No workspaces returned by the API.</p>
              )}
              {!isLoading && workspaces.slice(0, 5).map((item) => (
                <div key={item.idWorkspace} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-white">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.description || 'No description available.'}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-emerald-400">
                    Owner: {item.ownerUsername}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD UI COMPONENT ───
const DashboardUI = ({ content }: { content?: ReactNode }) => {
  const user = useAppStore((state) => state.user);
  const token = useAppStore((state) => state.token);
  const workspace = useAppStore((state) => state.currentWorkspace);
  const logout = useAppStore((state) => state.logout);
  const navigate = useNavigate();

  const handleSessionEnd = () => {
    logout();
    navigate('/login');
  };

  const handleAuthError = (error: unknown) => {
    if (!isApiError(error)) {
      return false;
    }

    if (error.status === 401) {
      handleSessionEnd();
      return true;
    }

    if (error.status === 403) {
      navigate('/forbidden', { replace: true });
      return true;
    }

    return false;
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await fetch(`${AUTH_BASE_URL}/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } finally {
      handleSessionEnd();
    }
  };

  const components = [
    { name: 'My Data Ingestion', icon: Database, color: 'text-emerald-400', adminOnly: false },
    { name: 'My Preprocessing', icon: Cpu, color: 'text-blue-400', adminOnly: false },
    { name: 'My Dataset Split', icon: Split, color: 'text-orange-400', adminOnly: false },
    { name: 'My Model Training', icon: Brain, color: 'text-purple-400', adminOnly: false },
    { name: 'Global Deployment', icon: Rocket, color: 'text-amber-400', adminOnly: true },
  ];

  const visibleComponents = components.filter(item => 
    !item.adminOnly || user?.role === 'ADMIN'
  );

  return (
    <div className="flex h-screen w-full bg-[#050505] text-slate-400 font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-white/5 bg-[#0a0a0a] p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-emerald-400 rounded-lg shadow-lg shadow-blue-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight italic">Synapse<span className="text-blue-500">Ops</span></h2>
          </div>
          
          <nav className="space-y-1">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] px-2 mb-4">Pipeline Core</p>
            
            {/* Usamos la lista filtrada */}
            {visibleComponents.map((item) => (
              <Button 
                key={item.name} 
                variant="ghost" 
                className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/5 rounded-xl px-2 group transition-all"
              >
                <item.icon className={`w-4 h-4 mr-3 ${item.color} group-hover:scale-110 transition-transform`} />
                <span className="text-xs font-medium">{item.name}</span>
              </Button>
            ))}

            {user?.role === 'ADMIN' && (
              <div className="mt-8 pt-8 border-t border-white/5 animate-in fade-in slide-in-from-bottom-2">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] px-2 mb-4">Admin Management</p>
                <Button 
                  onClick={() => navigate('/admin')}
                  variant="ghost" 
                  className="w-full justify-start text-slate-400 hover:text-white hover:bg-blue-500/10 rounded-xl px-2 group transition-all"
                >
                  <Layers className="w-4 h-4 mr-3 text-blue-500 group-hover:rotate-12 transition-transform" />
                  <span className="text-xs font-medium">Global CRUD Services</span>
                </Button>
              </div>
            )}
          </nav>

        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-tr from-blue-600/10 to-emerald-500/5 border border-white/5 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <p className="text-[10px] text-emerald-400 font-bold uppercase">System Live</p>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed font-mono">Uptime: 99.9%</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative">
        
        {/* HEADER */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#050505]/60 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 z-10" />
              <Input 
                placeholder="Search nodes..." 
                className="bg-white/5 border-white/10 rounded-full pl-10 text-xs focus-visible:ring-blue-500/50"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-white">{user?.name || user?.username}</p>
                <p className="text-[10px] text-slate-500 font-medium tracking-tighter uppercase">{user?.role} • Online</p>
              </div>
              <div className="w-10 h-10 rounded-xl border border-white/10 p-0.5 bg-gradient-to-br from-blue-500/20 to-transparent">
                <div className="w-full h-full rounded-[10px] bg-slate-900 flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-blue-400" />
                </div>
              </div>
            </div>

            <Button 
              onClick={handleLogout}
              variant="ghost"
              className="text-red-400/70 hover:bg-red-400/10 hover:text-red-400"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span className="text-xs font-medium">Logout</span>
            </Button>
          </div>
        </header>

        {/* WORKSPACE AREA */}
        <main className="flex-1 relative bg-[#050505] overflow-hidden p-8">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]"></div>

          <div className="relative z-10">
            {content ?? (
              token ? (
                <DashboardHomeContent
                  workspace={workspace}
                  role={user?.role}
                  token={token}
                  onAuthError={handleAuthError}
                />
              ) : null
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

// ─── HELPER COMPONENTS ───
function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  return (
    <Card className="bg-white/[0.03] border-white/5 backdrop-blur-xl hover:bg-white/[0.05] transition-all">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
        <p className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
          <span>+12.5%</span> <span className="text-slate-600">from last cycle</span>
        </p>
      </CardContent>
    </Card>
  );
}

// ─── MAIN APP COMPONENT ───
function App() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const role = useAppStore((state) => state.user?.role);
  const token = useAppStore((state) => state.token);

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={!isAuthenticated ? <LoginPage /> : <Navigate to="/dashboard" replace />} 
        />

        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <DashboardUI />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <RoleRoute isAuthenticated={isAuthenticated} role="ADMIN" currentRole={role}>
              <DashboardUI
                content={token ? <AdminCrudPage token={token} /> : <AdminCrudContent />}
              />
            </RoleRoute>
          }
        />

        <Route path="/forbidden" element={<ForbiddenPage />} />

        <Route 
          path="*" 
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
