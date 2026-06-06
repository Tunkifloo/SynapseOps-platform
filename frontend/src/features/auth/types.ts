import type { Role } from '@/types'

export interface LoginRequest {
  username: string
  password: string
}

export interface ForgotPasswordRequest {
  username: string
  newPassword: string
}

export interface SignupPayload {
  username: string
  name: string
  paternalSurname: string
  maternalSurname?: string
  email: string
  phone?: string
  studentCode: string
  career: string
  password: string
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
