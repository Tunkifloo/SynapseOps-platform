import { useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import type { Role } from '@/types'
import { ForbiddenPage } from '@/features/_shared/ForbiddenPage'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { SignUpPage } from '@/features/auth/pages/SignUpPage'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { AdminUsersPage } from '@/features/admin/pages/AdminUsersPage'
import { WorkspacesPage } from '@/features/workspaces/pages/WorkspacesPage'
import { PipelineBuilderPage } from '@/features/pipelines/pages/PipelineBuilderPage'
import { MlflowPage } from '@/features/mlflow/pages/MlflowPage'
import { AppShell } from '@/shared/layout/AppShell'
import { useAppStore } from '@/store/useAppStore'
import { useProtectedSession } from '@/features/auth/hooks/useProtectedSession'

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
  section: 'dashboard' | 'workspaces' | 'builder' | 'admin' | 'mlflow'
  renderPage: (props: PageProps) => ReactNode
}

function ShellPage({ section, renderPage }: ShellPageProps) {
  const { user, token, currentWorkspace, onAuthError, handleLogout } = useProtectedSession()
  const [searchQuery, setSearchQuery] = useState('')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <AppShell section={section} user={user} currentWorkspace={currentWorkspace} searchQuery={searchQuery} onSearchChange={setSearchQuery} onLogout={handleLogout}>
      {renderPage({ token, currentWorkspace, searchQuery, onAuthError })}
    </AppShell>
  )
}

export function AppRouter() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const role = useAppStore((state) => state.user?.role)

  return (
    <BrowserRouter>
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
              <ShellPage section="builder" renderPage={() => <PipelineBuilderPage />} />
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

        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
