import { useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RoleRoute } from '@/routes/RoleRoute'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage'
import { LoginPage } from '@/modules/auth/pages/LoginPage'
import { ForgotPasswordPage } from '@/modules/auth/pages/ForgotPasswordPage'
import { AdminUsersPage } from '@/modules/users/pages/AdminUsersPage'
import { WorkspacesPage } from '@/modules/workspaces/pages/WorkspacesPage'
import { AppShell } from '@/shared/layout/AppShell'
import { useAppStore } from '@/store/useAppStore'
import { useProtectedSession } from '@/features/auth/hooks/useProtectedSession'

interface PageProps {
  token: string
  currentWorkspace: string
  searchQuery: string
  onAuthError: (error: unknown) => boolean
}

interface ShellPageProps {
  section: 'dashboard' | 'workspaces' | 'admin'
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
          path="/admin"
          element={
            <RoleRoute isAuthenticated={isAuthenticated} role="ADMIN" currentRole={role}>
              <ShellPage section="admin" renderPage={({ token, searchQuery, onAuthError }) => <AdminUsersPage token={token} searchQuery={searchQuery} onAuthError={onAuthError} />} />
            </RoleRoute>
          }
        />

        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
