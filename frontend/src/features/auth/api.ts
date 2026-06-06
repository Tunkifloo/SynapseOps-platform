import { authorizedRequest, request, requestJson } from '@/shared/api/client'
import { AUTH_BASE_URL } from '@/shared/api/env'

import type { ForgotPasswordRequest, LoginRequest, LoginResponse, SignupPayload } from './types'

export const login = async (username: string, password: string) => {
  const payload: LoginRequest = { username, password }

  return requestJson<LoginResponse>(`${AUTH_BASE_URL}/login`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const forgotPassword = async (username: string, newPassword: string) => {
  const payload: ForgotPasswordRequest = { username, newPassword }

  await request(`${AUTH_BASE_URL}/forgot-password`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export const signup = async (payload: SignupPayload) => {
  await request(`${AUTH_BASE_URL}/signup`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      maternalSurname: payload.maternalSurname || null,
      phone: payload.phone || null,
    }),
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
