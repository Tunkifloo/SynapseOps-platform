import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import type { Role } from '@/types'

interface RoleRouteProps {
  isAuthenticated: boolean
  role: Role
  currentRole?: Role
  children: ReactNode
}

export function RoleRoute({ isAuthenticated, role, currentRole, children }: RoleRouteProps) {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return currentRole === role ? children : <Navigate to="/forbidden" replace />
}
