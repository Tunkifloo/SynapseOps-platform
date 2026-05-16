import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { logout } from '../api'
import { useAuthSession } from './useAuthSession'
import { useAppStore } from '@/store/useAppStore'
import type { SessionUser } from '../types'

export function useProtectedSession() {
  const user = useAppStore((state) => state.user as SessionUser | null)
  const token = useAppStore((state) => state.token)
  const currentWorkspace = useAppStore((state) => state.currentWorkspace)
  const navigate = useNavigate()
  const { clearAuth } = useAuthSession()

  const endSession = useCallback(() => {
    clearAuth()
    navigate('/login', { replace: true })
  }, [clearAuth, navigate])

  const onAuthError = useCallback((error: unknown) => {
    if (!(error instanceof Error) || !('status' in error)) {
      return false
    }

    const status = (error as { status: number }).status
    if (status === 401) {
      endSession()
      return true
    }

    if (status === 403) {
      navigate('/forbidden', { replace: true })
      return true
    }

    return false
  }, [endSession, navigate])

  const handleLogout = async () => {
    try {
      await logout(token)
    } finally {
      endSession()
    }
  }

  return {
    user,
    token,
    currentWorkspace,
    onAuthError,
    handleLogout,
  }
}
