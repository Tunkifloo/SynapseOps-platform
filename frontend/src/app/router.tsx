import { lazy, Suspense, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import type { Role } from '@/types'
import { ForbiddenPage } from '@/features/_shared/ForbiddenPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { AppShell } from '@/shared/layout/AppShell'
import { Spinner } from '@/shared/components/ui/spinner'
import { useAppStore } from '@/store/useAppStore'
import { useProtectedSession } from '@/features/auth/hooks/useProtectedSession'

// Páginas con carga diferida (code-splitting) → aligera el bundle inicial.
// LoginPage queda eager por ser el punto de entrada.
const SignUpPage = lazy(() => import('@/features/auth/pages/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
)
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AdminUsersPage = lazy(() => import('@/features/admin/pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const WorkspacesPage = lazy(() => import('@/features/workspaces/pages/WorkspacesPage').then((m) => ({ default: m.WorkspacesPage })))
const PipelineBuilderPage = lazy(() =>
  import('@/features/pipelines/pages/PipelineBuilderPage').then((m) => ({ default: m.PipelineBuilderPage }))
)
const MlflowPage = lazy(() => import('@/features/mlflow/pages/MlflowPage').then((m) => ({ default: m.MlflowPage })))
const MyModelsPage = lazy(() => import('@/features/mlflow/pages/MyModelsPage').then((m) => ({ default: m.MyModelsPage })))
const ProfilePage = lazy(() => import('@/features/profile/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const DeploymentsPage = lazy(() => import('@/features/deployments/pages/DeploymentsPage').then((m) => ({ default: m.DeploymentsPage })))
const MonitoringPage = lazy(() => import('@/features/monitoring/pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })))
const AnalyticsPage = lazy(() => import('@/features/analytics/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
      <Spinner />
    </div>
  )
}

interface ProtectedRouteProps {
  isAuthenticated: boolean
  children: ReactNode
}

function ProtectedRoute({ isAuthenticated, children }: ProtectedRouteProps) {
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

interface RoleRouteProps {
  isAuthenticated: boolean
  role: Role
  currentRole?: Role
  children: ReactNode
}

function RoleRoute({ isAuthenticated, role, currentRole, children }: RoleRouteProps) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return currentRole === role ? children : <Navigate to="/forbidden" replace />
}

interface PageProps {
  token: string
  currentWorkspace: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

interface ShellPageProps {
  section: 'dashboard' | 'workspaces' | 'builder' | 'models' | 'deployments' | 'monitoring' | 'analytics' | 'admin' | 'mlflow' | 'profile'
  renderPage: (props: PageProps) => ReactNode
}

function ShellPage({ section, renderPage }: ShellPageProps) {
  const { user, token, currentWorkspace, onAuthError, handleLogout } = useProtectedSession()
  const [searchQuery, setSearchQuery] = useState('')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <AppShell section={section} user={user} token={token} currentWorkspace={currentWorkspace} searchQuery={searchQuery} onSearchChange={setSearchQuery} onLogout={handleLogout}>
      <Suspense fallback={<PageFallback />}>
        {renderPage({ token, currentWorkspace, searchQuery, onAuthError })}
      </Suspense>
    </AppShell>
  )
}

export function AppRouter() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const role = useAppStore((state) => state.user?.role)

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-[100svh] items-center justify-center bg-background"><Spinner /></div>}>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/dashboard" replace />} />

        <Route path="/signup" element={!isAuthenticated ? <SignUpPage /> : <Navigate to="/dashboard" replace />} />

        <Route path="/forgot-password" element={!isAuthenticated ? <ForgotPasswordPage /> : <Navigate to="/dashboard" replace />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellPage section="dashboard" renderPage={({ token, currentWorkspace, searchQuery, onAuthError }) => <DashboardPage token={token} role={role} currentWorkspace={currentWorkspace} searchQuery={searchQuery} onAuthError={onAuthError} />} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/workspaces"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellPage section="workspaces" renderPage={({ token, searchQuery, onAuthError }) => <WorkspacesPage token={token} searchQuery={searchQuery} onAuthError={onAuthError} />} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/builder"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellPage
                section="builder"
                renderPage={({ token, onAuthError }) => (
                  <PipelineBuilderPage token={token} onAuthError={onAuthError} />
                )}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <RoleRoute isAuthenticated={isAuthenticated} role="ADMIN" currentRole={role}>
              <ShellPage section="admin" renderPage={({ token, searchQuery, onAuthError }) => <AdminUsersPage token={token} searchQuery={searchQuery} onAuthError={onAuthError} />} />
            </RoleRoute>
          }
        />

        <Route
          path="/analytics"
          element={
            <RoleRoute isAuthenticated={isAuthenticated} role="ADMIN" currentRole={role}>
              <ShellPage
                section="analytics"
                renderPage={({ token, onAuthError }) => (
                  <AnalyticsPage token={token} onAuthError={onAuthError} />
                )}
              />
            </RoleRoute>
          }
        />

        <Route
          path="/mlflow"
          element={
            <RoleRoute isAuthenticated={isAuthenticated} role="ADMIN" currentRole={role}>
              <ShellPage
                section="mlflow"
                renderPage={({ token, onAuthError }) => (
                  <MlflowPage token={token} onAuthError={onAuthError} />
                )}
              />
            </RoleRoute>
          }
        />

        <Route
          path="/models"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellPage
                section="models"
                renderPage={({ token, searchQuery, onAuthError }) => (
                  <MyModelsPage token={token} searchQuery={searchQuery} onAuthError={onAuthError} />
                )}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/deployments"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellPage
                section="deployments"
                renderPage={({ token, onAuthError }) => (
                  <DeploymentsPage token={token} onAuthError={onAuthError} />
                )}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/monitoring"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellPage
                section="monitoring"
                renderPage={({ token, onAuthError }) => (
                  <MonitoringPage token={token} onAuthError={onAuthError} />
                )}
              />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellPage
                section="profile"
                renderPage={({ token, onAuthError }) => (
                  <ProfilePage token={token} onAuthError={onAuthError} />
                )}
              />
            </ProtectedRoute>
          }
        />

        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
