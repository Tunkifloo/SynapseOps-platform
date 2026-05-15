import { useAppStore } from '@/store/useAppStore'

import { mapTokenToSessionUser } from '../auth.mapper'

export function useAuthSession() {
  const setAuth = useAppStore((state) => state.setAuth)
  const clearAuth = useAppStore((state) => state.logout)

  const persistSession = (token: string, identifier: string) => {
    setAuth(token, mapTokenToSessionUser(token, identifier))
  }

  return {
    persistSession,
    clearAuth,
  }
}
