import type { Role } from '@/types'

export interface LoginRequest {
  username: string
  password: string
}

export interface ForgotPasswordRequest {
  username: string
  newPassword: string
}

export interface JwtClaims {
  sub?: string
  role?: string
}

export interface LoginResponse {
  token: string
}

export interface SessionUser {
  username: string
  name: string
  role: Role
}
