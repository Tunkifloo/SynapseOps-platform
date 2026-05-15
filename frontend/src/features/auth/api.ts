import { authorizedRequest, requestJson } from '@/shared/api/client'
import { AUTH_BASE_URL } from '@/shared/api/env'

import type { LoginRequest, LoginResponse } from './types'

export const login = async (username: string, password: string) => {
  const payload: LoginRequest = { username, password }

  return requestJson<LoginResponse>(`${AUTH_BASE_URL}/login`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const logout = async (token: string | null) => {
  if (!token) {
    return
  }

  await authorizedRequest('/auth/logout', token, {
    method: 'POST',
  })
}
