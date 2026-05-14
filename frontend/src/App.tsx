import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Activity,
  Brain,
  Database,
  Layers,
  LogOut,
  Search,
  Shield,
  User as UserIcon,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoginPage } from './pages/LoginPage';
import { useAppStore } from './store/useAppStore';
import type { Role } from './types';

const AUTH_BASE_URL = 'http://localhost:8080/api/v1/auth';
const API_BASE_URL = 'http://localhost:8080/api/v1';

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  color: string;
}

interface ApiErrorLike {
  status: number;
  message: string;
}

interface ProblemDetail {
  detail?: string;
}

interface SessionUser {
  username: string;
  name: string;
  role: Role;
}

interface WorkspaceSummary {
  idWorkspace: number;
  name: string;
  description: string;
  createdAt: string;
  idUser: number;
  ownerUsername: string;
  datasetPath: string | null;
}

interface PipelineSummary {
  idPipeline: number;
  name: string;
  status: string;
  idWorkspace: number;
  nodeCount: number;
  executionCount: number;
}

interface UserSummary {
  idUser: number;
  username: string;
  name: string;
  email: string;
  role: Role;
  paternalSurname: string;
  maternalSurname: string;
  phone: string | null;
  enabled: boolean;
}

interface UserRegistrationPayload {
  username: string;
  password: string;
  name: string;
  paternalSurname: string;
  maternalSurname: string;
  email: string;
  phone: string;
  role: Role;
}

interface WorkspacePayload {
  name: string;
  description: string;
}

interface PipelinePayload {
  name: string;
}

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  children: ReactNode;
}

interface RoleRouteProps extends ProtectedRouteProps {
  role: Role;
  currentRole?: Role;
}

interface DashboardLayoutTools {
  user: SessionUser | null;
  token: string | null;
  currentWorkspace: string;
  onAuthError: (error: unknown) => boolean;
}

interface DashboardLayoutProps {
  section: 'dashboard' | 'workspaces' | 'admin';
  renderContent: (tools: DashboardLayoutTools) => ReactNode;
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

const emptyStudentForm = (): UserRegistrationPayload => ({
  username: '',
  password: '',
  name: '',
  paternalSurname: '',
  maternalSurname: '',
  email: '',
  phone: '',
  role: 'COLLABORATOR',
});

const emptyWorkspaceForm = (): WorkspacePayload => ({
  name: '',
  description: '',
});

const emptyPipelineForm = (): PipelinePayload => ({
  name: '',
});

const extractFilename = (datasetPath: string) => datasetPath.split(/[/\\]/).pop() ?? datasetPath;

const getProblemDetail = async (response: Response) => {
  const problem = await response.json().catch(() => null) as ProblemDetail | null;
  return problem?.detail ?? `Request failed with status ${response.status}`;
};

const authorizedRequest = async (path: string, token: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await getProblemDetail(response));
  }

  return response;
};

const fetchJson = async <T,>(path: string, token: string, init?: RequestInit) => (
  authorizedRequest(path, token, init).then((response) => response.json() as Promise<T>)
);

const sendJson = async <T,>(path: string, token: string, method: string, body: unknown) => (
  fetchJson<T>(path, token, {
    method,
    body: JSON.stringify(body),
  })
);

const sendVoid = async (path: string, token: string, method: string) => {
  await authorizedRequest(path, token, { method });
};

const sendText = async (path: string, token: string, method: string, body?: FormData) => {
  const response = await authorizedRequest(path, token, {
    method,
    body,
  });

  return response.text();
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

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-500">{eyebrow}</p>
      <h1 className="text-3xl font-bold text-white">{title}</h1>
      <p className="max-w-3xl text-sm text-slate-400">{description}</p>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{children}</label>;
}

function FormField({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-28 w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus-visible:ring-[3px] focus-visible:ring-blue-500/30 ${props.className ?? ''}`}
    />
  );
}

function TableShell({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="border-white/5 bg-white/[0.03]">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-white">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

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
          <span>Live</span> <span className="text-slate-600">frontend state</span>
        </p>
      </CardContent>
    </Card>
  );
}

function DashboardHomeContent({ token, user, currentWorkspace, onAuthError }: DashboardLayoutTools) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setIsLoading(true);

        try {
          const endpoint = user?.role === 'ADMIN' ? '/workspaces/all' : '/workspaces';
          const data = await fetchJson<WorkspaceSummary[]>(endpoint, token);

          if (!cancelled) {
            setWorkspaces(data);
            setError(null);
          }
        } catch (error) {
          if (cancelled || onAuthError(error)) {
            return;
          }

          setError(error instanceof Error ? error.message : 'No se pudieron cargar los workspaces.');
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onAuthError, token, user]);

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Overview"
        title="Operational Workspace Snapshot"
        description="Esta vista resume el alcance actual de la sesión autenticada y enlaza las áreas administrativas o personales disponibles según tu rol."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard title={user?.role === 'ADMIN' ? 'Global Workspaces' : 'My Workspaces'} value={isLoading ? '...' : String(workspaces.length)} icon={Layers} color="text-blue-500" />
        <StatCard title="Current Role" value={user?.role ?? 'N/A'} icon={Shield} color="text-emerald-500" />
        <StatCard title="Current Workspace" value={currentWorkspace || 'None'} icon={Database} color="text-orange-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <TableShell title={user?.role === 'ADMIN' ? 'Accessible Workspaces' : 'My Workspaces'} action={
          <Button variant="outline" size="sm" onClick={() => navigate('/workspaces')}>Open Workspaces</Button>
        }>
          <div className="space-y-3">
            {isLoading && <p className="text-sm text-slate-400">Loading workspaces...</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!isLoading && !error && workspaces.length === 0 && (
              <p className="text-sm text-slate-400">No workspaces available for this session.</p>
            )}
            {!isLoading && !error && workspaces.slice(0, 4).map((item) => (
              <div key={item.idWorkspace} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">{item.name}</p>
                <p className="mt-1 text-xs text-slate-400">{item.description || 'No description available.'}</p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Owner: {item.ownerUsername}</p>
              </div>
            ))}
          </div>
        </TableShell>

        <TableShell title="Next Actions" action={user?.role === 'ADMIN' ? (
          <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>Open Admin Panel</Button>
        ) : undefined}>
          <div className="space-y-3 text-sm text-slate-400">
            <p>
              {user?.role === 'ADMIN'
                ? 'Gestiona usuarios activos, workspaces globales y cuentas deshabilitadas desde el panel administrativo.'
                : 'Crea proyectos aislados, carga dataset por workspace y administra pipelines del proyecto seleccionado.'}
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-400">Session owner: {user?.username}</p>
          </div>
        </TableShell>
      </div>
    </div>
  );
}

function AdminUsersPage({ token, onAuthError }: { token: string; onAuthError: (error: unknown) => boolean }) {
  const [activeUsers, setActiveUsers] = useState<UserSummary[]>([]);
  const [disabledUsers, setDisabledUsers] = useState<UserSummary[]>([]);
  const [form, setForm] = useState<UserRegistrationPayload>(emptyStudentForm());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setIsLoading(true);

        try {
          const [enabled, disabled] = await Promise.all([
            fetchJson<UserSummary[]>('/users', token),
            fetchJson<UserSummary[]>('/users/disabled', token),
          ]);

          if (!cancelled) {
            setActiveUsers(enabled);
            setDisabledUsers(disabled);
            setError(null);
          }
        } catch (error) {
          if (cancelled || onAuthError(error)) {
            return;
          }

          setError(error instanceof Error ? error.message : 'No se pudieron cargar los usuarios.');
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onAuthError, token]);

  const handleFieldChange = (field: keyof UserRegistrationPayload) => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice(null);

    try {
      await sendJson<{ token: string }>('/auth/register', token, 'POST', {
        ...form,
        maternalSurname: form.maternalSurname || null,
        phone: form.phone || null,
        role: 'COLLABORATOR',
      });

      setForm(emptyStudentForm());
      setNotice('Student account created successfully.');
      setError(null);

      const [enabled, disabled] = await Promise.all([
        fetchJson<UserSummary[]>('/users', token),
        fetchJson<UserSummary[]>('/users/disabled', token),
      ]);
      setActiveUsers(enabled);
      setDisabledUsers(disabled);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo crear el estudiante.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (idUser: number) => {
    setNotice(null);

    try {
      await sendVoid(`/users/${idUser}/toggle-status`, token, 'PATCH');
      setError(null);
      setNotice('User status updated successfully.');

      const [enabled, disabled] = await Promise.all([
        fetchJson<UserSummary[]>('/users', token),
        fetchJson<UserSummary[]>('/users/disabled', token),
      ]);
      setActiveUsers(enabled);
      setDisabledUsers(disabled);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo actualizar el estado del usuario.');
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="HU-013"
        title="Administrative User Management"
        description="Gestiona cuentas de estudiantes desde una tabla administrativa, crea nuevas cuentas colaboradoras y aplica desactivación lógica sin eliminar registros." 
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard title="Active Students" value={isLoading ? '...' : String(activeUsers.length)} icon={Users} color="text-blue-500" />
        <StatCard title="Disabled Accounts" value={isLoading ? '...' : String(disabledUsers.length)} icon={Shield} color="text-orange-500" />
        <StatCard title="Admin Scope" value="Global" icon={Layers} color="text-emerald-500" />
      </div>

      {(error || notice) && (
        <Card className={`border-white/5 ${error ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          <CardContent className="pt-6 text-sm text-white">
            {error ?? notice}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.6fr]">
        <TableShell title="Create Student Account">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateStudent}>
            <FormField>
              <FieldLabel>Username</FieldLabel>
              <Input value={form.username} onChange={handleFieldChange('username')} required />
            </FormField>
            <FormField>
              <FieldLabel>Password</FieldLabel>
              <Input type="password" value={form.password} onChange={handleFieldChange('password')} minLength={7} required />
            </FormField>
            <FormField>
              <FieldLabel>Name</FieldLabel>
              <Input value={form.name} onChange={handleFieldChange('name')} required />
            </FormField>
            <FormField>
              <FieldLabel>Paternal Surname</FieldLabel>
              <Input value={form.paternalSurname} onChange={handleFieldChange('paternalSurname')} required />
            </FormField>
            <FormField>
              <FieldLabel>Maternal Surname</FieldLabel>
              <Input value={form.maternalSurname} onChange={handleFieldChange('maternalSurname')} />
            </FormField>
            <FormField>
              <FieldLabel>Phone</FieldLabel>
              <Input value={form.phone} onChange={handleFieldChange('phone')} placeholder="999999999" />
            </FormField>
            <div className="md:col-span-2">
              <FormField>
                <FieldLabel>Email</FieldLabel>
                <Input type="email" value={form.email} onChange={handleFieldChange('email')} required />
              </FormField>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Student'}
              </Button>
            </div>
          </form>
        </TableShell>

        <div className="space-y-6">
          <TableShell title="Active Accounts">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
                <thead className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="pb-3">User</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!isLoading && activeUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">No active users available.</td>
                    </tr>
                  )}
                  {activeUsers.map((item) => (
                    <tr key={item.idUser} className="border-t border-white/5">
                      <td className="py-4">
                        <p className="font-semibold text-white">{item.name || item.username}</p>
                        <p className="text-xs text-slate-500">@{item.username}</p>
                      </td>
                      <td className="py-4">{item.email}</td>
                      <td className="py-4">{item.role}</td>
                      <td className="py-4 text-emerald-400">Enabled</td>
                      <td className="py-4 text-right">
                        <Button variant="destructive" size="sm" onClick={() => void handleToggleStatus(item.idUser)}>
                          Disable
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableShell>

          <TableShell title="Soft Deleted Accounts">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
                <thead className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="pb-3">User</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!isLoading && disabledUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">No disabled accounts.</td>
                    </tr>
                  )}
                  {disabledUsers.map((item) => (
                    <tr key={item.idUser} className="border-t border-white/5">
                      <td className="py-4">
                        <p className="font-semibold text-white">{item.name || item.username}</p>
                        <p className="text-xs text-slate-500">@{item.username}</p>
                      </td>
                      <td className="py-4">{item.email}</td>
                      <td className="py-4">{item.role}</td>
                      <td className="py-4 text-orange-400">Disabled</td>
                      <td className="py-4 text-right">
                        <Button variant="outline" size="sm" onClick={() => void handleToggleStatus(item.idUser)}>
                          Reactivate
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableShell>
        </div>
      </div>
    </div>
  );
}

function WorkspacesPage({ token, onAuthError }: { token: string; onAuthError: (error: unknown) => boolean }) {
  const setWorkspace = useAppStore((state) => state.setWorkspace);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [pipelines, setPipelines] = useState<PipelineSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [workspaceForm, setWorkspaceForm] = useState<WorkspacePayload>(emptyWorkspaceForm());
  const [pipelineForm, setPipelineForm] = useState<PipelinePayload>(emptyPipelineForm());
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<number | null>(null);
  const [renamingPipelineId, setRenamingPipelineId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [isSavingPipeline, setIsSavingPipeline] = useState(false);
  const [isUploadingDataset, setIsUploadingDataset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPipelines = useCallback(async (workspaceId: number) => {
    setIsLoadingPipelines(true);

    try {
      const data = await fetchJson<PipelineSummary[]>(`/workspaces/${workspaceId}/pipelines`, token);
      setPipelines(data);
      setError(null);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudieron cargar los pipelines del proyecto.');
    } finally {
      setIsLoadingPipelines(false);
    }
  }, [onAuthError, token]);

  const applyWorkspaceSelection = (items: WorkspaceSummary[], preferredId?: number | null) => {
    if (items.length === 0) {
      setSelectedWorkspaceId(null);
      setWorkspace('Default Project');
      setPipelines([]);
      return;
    }

    const nextWorkspace = items.find((item) => item.idWorkspace === preferredId)
      ?? items.find((item) => item.idWorkspace === selectedWorkspaceId)
      ?? items[0];

    setSelectedWorkspaceId(nextWorkspace.idWorkspace);
    setWorkspace(nextWorkspace.name);
    void loadPipelines(nextWorkspace.idWorkspace);
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setIsLoadingWorkspaces(true);

        try {
          const data = await fetchJson<WorkspaceSummary[]>('/workspaces', token);

          if (!cancelled) {
            setWorkspaces(data);
            if (data.length === 0) {
              setSelectedWorkspaceId(null);
              setWorkspace('Default Project');
              setPipelines([]);
            } else {
              const nextWorkspace = data[0];
              setSelectedWorkspaceId(nextWorkspace.idWorkspace);
              setWorkspace(nextWorkspace.name);
              void loadPipelines(nextWorkspace.idWorkspace);
            }
            setError(null);
          }
        } catch (error) {
          if (cancelled || onAuthError(error)) {
            return;
          }

          setError(error instanceof Error ? error.message : 'No se pudieron cargar tus proyectos.');
        } finally {
          if (!cancelled) {
            setIsLoadingWorkspaces(false);
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadPipelines, onAuthError, setWorkspace, token]);

  const selectedWorkspace = workspaces.find((item) => item.idWorkspace === selectedWorkspaceId) ?? null;

  const handleSelectWorkspace = (workspace: WorkspaceSummary) => {
    setSelectedWorkspaceId(workspace.idWorkspace);
    setWorkspace(workspace.name);
    void loadPipelines(workspace.idWorkspace);
  };

  const handleWorkspaceFieldChange = (field: keyof WorkspacePayload) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setWorkspaceForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const resetWorkspaceForm = () => {
    setWorkspaceForm(emptyWorkspaceForm());
    setEditingWorkspaceId(null);
  };

  const handleSubmitWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingWorkspace(true);
    setNotice(null);

    try {
      let selectedId: number;

      if (editingWorkspaceId) {
        const updated = await sendJson<WorkspaceSummary>(`/workspaces/${editingWorkspaceId}`, token, 'PUT', workspaceForm);
        selectedId = updated.idWorkspace;
        setNotice('Workspace updated successfully.');
      } else {
        const created = await sendJson<WorkspaceSummary>('/workspaces', token, 'POST', workspaceForm);
        selectedId = created.idWorkspace;
        setNotice('Workspace created successfully.');
      }

      setError(null);
      resetWorkspaceForm();
      const data = await fetchJson<WorkspaceSummary[]>('/workspaces', token);
      setWorkspaces(data);
      applyWorkspaceSelection(data, selectedId);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo guardar el workspace.');
    } finally {
      setIsSavingWorkspace(false);
    }
  };

  const startEditingWorkspace = (workspace: WorkspaceSummary) => {
    setEditingWorkspaceId(workspace.idWorkspace);
    setWorkspaceForm({
      name: workspace.name,
      description: workspace.description ?? '',
    });
  };

  const handleDeleteWorkspace = async (workspaceId: number) => {
    setNotice(null);

    try {
      await sendVoid(`/workspaces/${workspaceId}`, token, 'DELETE');
      setError(null);
      setNotice('Workspace deleted successfully.');
      if (selectedWorkspaceId === workspaceId) {
        setSelectedWorkspaceId(null);
      }
      resetWorkspaceForm();

      const data = await fetchJson<WorkspaceSummary[]>('/workspaces', token);
      setWorkspaces(data);
      applyWorkspaceSelection(data);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo eliminar el workspace.');
    }
  };

  const handleDatasetUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedWorkspaceId || !datasetFile) {
      setError('Select a workspace and file before uploading a dataset.');
      return;
    }

    setIsUploadingDataset(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append('file', datasetFile);
      const message = await sendText(`/workspaces/${selectedWorkspaceId}/dataset`, token, 'POST', formData);
      setDatasetFile(null);
      setError(null);
      setNotice(message);

      const data = await fetchJson<WorkspaceSummary[]>('/workspaces', token);
      setWorkspaces(data);
      applyWorkspaceSelection(data, selectedWorkspaceId);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo cargar el dataset.');
    } finally {
      setIsUploadingDataset(false);
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedWorkspaceId || !selectedWorkspace?.datasetPath) {
      return;
    }

    setNotice(null);

    try {
      await sendVoid(`/workspaces/${selectedWorkspaceId}/dataset/${extractFilename(selectedWorkspace.datasetPath)}`, token, 'DELETE');
      setError(null);
      setNotice('Dataset removed successfully.');

      const data = await fetchJson<WorkspaceSummary[]>('/workspaces', token);
      setWorkspaces(data);
      applyWorkspaceSelection(data, selectedWorkspaceId);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo eliminar el dataset.');
    }
  };

  const handleCreatePipeline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      setError('Select a workspace before creating a pipeline.');
      return;
    }

    setIsSavingPipeline(true);
    setNotice(null);

    try {
      await sendJson<PipelineSummary>(`/workspaces/${selectedWorkspaceId}/pipelines`, token, 'POST', pipelineForm);
      setPipelineForm(emptyPipelineForm());
      setError(null);
      setNotice('Pipeline created successfully.');
      await loadPipelines(selectedWorkspaceId);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo crear el pipeline.');
    } finally {
      setIsSavingPipeline(false);
    }
  };

  const handleRenamePipeline = async (pipelineId: number) => {
    if (!selectedWorkspaceId || !renameValue.trim()) {
      return;
    }

    setIsSavingPipeline(true);
    setNotice(null);

    try {
      await sendJson<PipelineSummary>(`/workspaces/${selectedWorkspaceId}/pipelines/${pipelineId}/rename`, token, 'PATCH', {
        name: renameValue.trim(),
      });
      setRenamingPipelineId(null);
      setRenameValue('');
      setError(null);
      setNotice('Pipeline renamed successfully.');
      await loadPipelines(selectedWorkspaceId);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo renombrar el pipeline.');
    } finally {
      setIsSavingPipeline(false);
    }
  };

  const handleDeletePipeline = async (pipelineId: number) => {
    if (!selectedWorkspaceId) {
      return;
    }

    setNotice(null);

    try {
      await sendVoid(`/workspaces/${selectedWorkspaceId}/pipelines/${pipelineId}`, token, 'DELETE');
      setError(null);
      setNotice('Pipeline deleted successfully.');
      await loadPipelines(selectedWorkspaceId);
    } catch (error) {
      if (onAuthError(error)) {
        return;
      }

      setError(error instanceof Error ? error.message : 'No se pudo eliminar el pipeline.');
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="HU-014"
        title="Workspace Project Management"
        description="Administra tus proyectos MLOps, su dataset aislado y los pipelines asociados al workspace seleccionado sin salir del contexto del estudiante autenticado."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard title="My Projects" value={isLoadingWorkspaces ? '...' : String(workspaces.length)} icon={Layers} color="text-blue-500" />
        <StatCard title="Workspace Pipelines" value={selectedWorkspaceId ? (isLoadingPipelines ? '...' : String(pipelines.length)) : '0'} icon={Brain} color="text-emerald-500" />
        <StatCard title="Dataset Status" value={selectedWorkspace?.datasetPath ? 'Attached' : 'Pending'} icon={Database} color="text-orange-500" />
      </div>

      {(error || notice) && (
        <Card className={`border-white/5 ${error ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          <CardContent className="pt-6 text-sm text-white">
            {error ?? notice}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_2fr]">
        <div className="space-y-6">
          <TableShell title={editingWorkspaceId ? 'Edit Project' : 'Create Project'} action={editingWorkspaceId ? (
            <Button variant="outline" size="sm" onClick={resetWorkspaceForm}>Cancel Edit</Button>
          ) : undefined}>
            <form className="space-y-4" onSubmit={handleSubmitWorkspace}>
              <FormField>
                <FieldLabel>Project Name</FieldLabel>
                <Input value={workspaceForm.name} onChange={handleWorkspaceFieldChange('name')} required />
              </FormField>
              <FormField>
                <FieldLabel>Description</FieldLabel>
                <TextArea value={workspaceForm.description} onChange={handleWorkspaceFieldChange('description')} placeholder="Describe the workspace purpose" />
              </FormField>
              <Button type="submit" disabled={isSavingWorkspace}>
                {isSavingWorkspace ? 'Saving...' : editingWorkspaceId ? 'Update Project' : 'Create Project'}
              </Button>
            </form>
          </TableShell>

          <TableShell title="My Projects">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm text-slate-300">
                <thead className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="pb-3">Project</th>
                    <th className="pb-3">Description</th>
                    <th className="pb-3">Dataset</th>
                    <th className="pb-3">Created</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingWorkspaces && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">Loading projects...</td>
                    </tr>
                  )}
                  {!isLoadingWorkspaces && workspaces.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">No projects created yet.</td>
                    </tr>
                  )}
                  {workspaces.map((item) => {
                    const isSelected = item.idWorkspace === selectedWorkspaceId;

                    return (
                      <tr key={item.idWorkspace} className={`border-t border-white/5 ${isSelected ? 'bg-blue-500/10' : ''}`}>
                        <td className="py-4">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => handleSelectWorkspace(item)}
                          >
                            <p className="font-semibold text-white">{item.name}</p>
                            <p className="text-xs text-slate-500">ID #{item.idWorkspace}</p>
                          </button>
                        </td>
                        <td className="py-4 text-slate-400">{item.description || 'No description available.'}</td>
                        <td className="py-4 text-slate-400">{item.datasetPath ? 'Attached' : 'Pending'}</td>
                        <td className="py-4 text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</td>
                        <td className={`py-4 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`}>
                          {isSelected ? 'Active' : 'Idle'}
                        </td>
                        <td className="py-4">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleSelectWorkspace(item)}>
                              Open
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => startEditingWorkspace(item)}>
                              Edit
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => void handleDeleteWorkspace(item.idWorkspace)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TableShell>
        </div>

        <div className="space-y-6">
          <TableShell title="Selected Workspace Context">
            {!selectedWorkspace && (
              <p className="text-sm text-slate-400">Select or create a project to inspect its isolated dataset and pipelines.</p>
            )}

            {selectedWorkspace && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-white/5 bg-black/20">
                    <CardHeader>
                      <CardTitle className="text-white">Dataset Isolation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-slate-400">
                        Este proyecto mantiene su propio `datasetPath`, aislado del resto de workspaces del usuario.
                      </p>
                      <p className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-300">
                        {selectedWorkspace.datasetPath ?? 'No dataset uploaded yet.'}
                      </p>
                      <form className="space-y-3" onSubmit={handleDatasetUpload}>
                        <Input
                          type="file"
                          onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
                          accept=".csv,.png,.jpg,.jpeg"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" disabled={isUploadingDataset || !datasetFile}>
                            {isUploadingDataset ? 'Uploading...' : 'Upload Dataset'}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => void handleDeleteDataset()}
                            disabled={!selectedWorkspace.datasetPath}
                          >
                            Remove Dataset
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border-white/5 bg-black/20">
                    <CardHeader>
                      <CardTitle className="text-white">Pipeline Isolation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-slate-400">
                        Los pipelines se consultan y mutan usando el `workspaceId` activo, asegurando que cada proyecto opere sobre su propio flujo.
                      </p>
                      <form className="space-y-3" onSubmit={handleCreatePipeline}>
                        <FormField>
                          <FieldLabel>New Pipeline</FieldLabel>
                          <Input
                            value={pipelineForm.name}
                            onChange={(event) => setPipelineForm({ name: event.target.value })}
                            placeholder="Training Pipeline"
                            required
                          />
                        </FormField>
                        <Button type="submit" disabled={isSavingPipeline}>
                          {isSavingPipeline ? 'Saving...' : 'Create Pipeline'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-white/5 bg-black/20">
                  <CardHeader>
                    <CardTitle className="text-white">Workspace Pipelines</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isLoadingPipelines && <p className="text-sm text-slate-400">Loading pipelines...</p>}
                    {!isLoadingPipelines && pipelines.length === 0 && (
                      <p className="text-sm text-slate-400">No pipelines attached to this workspace.</p>
                    )}
                    {pipelines.map((item) => (
                      <div key={item.idPipeline} className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                        {renamingPipelineId === item.idPipeline ? (
                          <div className="space-y-3">
                            <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => void handleRenamePipeline(item.idPipeline)} disabled={isSavingPipeline}>
                                Save Name
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => {
                                setRenamingPipelineId(null);
                                setRenameValue('');
                              }}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-white">{item.name}</p>
                                <p className="mt-1 text-xs text-slate-400">Status: {item.status}</p>
                                <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                  Nodes: {item.nodeCount} · Executions: {item.executionCount}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setRenamingPipelineId(item.idPipeline);
                                    setRenameValue(item.name);
                                  }}
                                >
                                  Rename
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => void handleDeletePipeline(item.idPipeline)}>
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </TableShell>
        </div>
      </div>
    </div>
  );
}

function DashboardLayout({ section, renderContent }: DashboardLayoutProps) {
  const user = useAppStore((state) => state.user as SessionUser | null);
  const token = useAppStore((state) => state.token);
  const currentWorkspace = useAppStore((state) => state.currentWorkspace);
  const logout = useAppStore((state) => state.logout);
  const navigate = useNavigate();

  const handleSessionEnd = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const onAuthError = (error: unknown) => {
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

  const navigationItems = [
    { key: 'dashboard', label: 'Overview', icon: Activity, path: '/dashboard' },
    { key: 'workspaces', label: 'My Projects', icon: Layers, path: '/workspaces' },
  ] as const;

  const adminItems = user?.role === 'ADMIN'
    ? [{ key: 'admin', label: 'Admin Users', icon: Users, path: '/admin' }] as const
    : [];

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
            <p className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Workspace Core</p>
            {navigationItems.map((item) => (
              <Button
                key={item.key}
                onClick={() => navigate(item.path)}
                variant="ghost"
                className={`w-full justify-start rounded-xl px-2 transition-all ${section === item.key ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
              >
                <item.icon className="mr-3 h-4 w-4 text-blue-400" />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            ))}

            {adminItems.length > 0 && (
              <div className="mt-8 border-t border-white/5 pt-8">
                <p className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500">Admin Management</p>
                {adminItems.map((item) => (
                  <Button
                    key={item.key}
                    onClick={() => navigate(item.path)}
                    variant="ghost"
                    className={`w-full justify-start rounded-xl px-2 transition-all ${section === item.key ? 'bg-blue-500/10 text-white' : 'text-slate-400 hover:bg-blue-500/10 hover:text-white'}`}
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
            <p className="text-[10px] font-mono leading-relaxed text-slate-500">Workspace: {currentWorkspace}</p>
          </div>
        </div>
      </aside>

      <div className="relative flex flex-1 flex-col">
        <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-white/5 bg-[#050505]/60 px-8 backdrop-blur-md">
          <div className="flex flex-1 items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <Input placeholder="Search workspaces or users..." className="rounded-full border-white/10 bg-white/5 pl-10 text-xs focus-visible:ring-blue-500/50" />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-white">{user?.name || user?.username}</p>
                <p className="text-[10px] font-medium uppercase tracking-tighter text-slate-500">{user?.role} • Online</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-transparent p-0.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-slate-900">
                  <UserIcon className="h-5 w-5 text-blue-400" />
                </div>
              </div>
            </div>

            <Button onClick={() => void handleLogout()} variant="ghost" className="text-red-400/70 hover:bg-red-400/10 hover:text-red-400">
              <LogOut className="mr-2 h-4 w-4" />
              <span className="text-xs font-medium">Logout</span>
            </Button>
          </div>
        </header>

        <main className="relative flex-1 overflow-auto bg-[#050505] p-8">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          <div className="relative z-10">
            {renderContent({
              user,
              token,
              currentWorkspace,
              onAuthError,
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function DashboardPage() {
  return (
    <DashboardLayout
      section="dashboard"
      renderContent={(tools) => <DashboardHomeContent {...tools} />}
    />
  );
}

function WorkspacesRoutePage() {
  return (
    <DashboardLayout
      section="workspaces"
      renderContent={({ token, onAuthError }) => (
        token ? <WorkspacesPage token={token} onAuthError={onAuthError} /> : null
      )}
    />
  );
}

function AdminRoutePage() {
  return (
    <DashboardLayout
      section="admin"
      renderContent={({ token, onAuthError }) => (
        token ? <AdminUsersPage token={token} onAuthError={onAuthError} /> : <EmptyState title="Admin session unavailable" message="No authentication token was found." />
      )}
    />
  );
}

function App() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const role = useAppStore((state) => state.user?.role);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/dashboard" replace />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/workspaces"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <WorkspacesRoutePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <RoleRoute isAuthenticated={isAuthenticated} role="ADMIN" currentRole={role}>
              <AdminRoutePage />
            </RoleRoute>
          }
        />

        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App
