import { fetchJson, sendJson, sendVoid } from '@/shared/api/client'
import type { Role } from '@/types'

import type {
  CreateStudentFormData,
  UserPasswordUpdatePayload,
  UserProfileUpdatePayload,
  UserSummary,
  UserUpdatePayload,
} from './types'
import { collaboratorRole, isCollaboratorUser } from './types'

export const listUsers = (token: string) => (
  fetchJson<UserSummary[]>('/users', token)
)

export const listUsersByRole = (token: string, role: Role) => (
  fetchJson<UserSummary[]>(`/users/role/${role}`, token)
)

export const listCollaborators = (token: string) => (
  listUsersByRole(token, collaboratorRole)
)

export const listDisabledUsers = (token: string) => (
  fetchJson<UserSummary[]>('/users/disabled', token)
    .then((users) => users.filter(isCollaboratorUser))
)

export const getUserById = (token: string, userId: number) => (
  fetchJson<UserSummary>(`/users/${userId}`, token)
)

export const updateUserByAdmin = (token: string, userId: number, payload: UserUpdatePayload) => (
  sendJson<UserSummary>(`/users/${userId}`, token, 'PUT', payload)
)

export const getMyProfile = (token: string) => (
  fetchJson<UserSummary>('/users/me', token)
)

export const updateMyProfile = (token: string, payload: UserProfileUpdatePayload) => (
  sendJson<UserSummary>('/users/me', token, 'PUT', payload)
)

export const updateMyPassword = (token: string, payload: UserPasswordUpdatePayload) => (
  sendJson<string>('/users/me/password', token, 'PATCH', payload)
)

export const createStudent = (token: string, payload: CreateStudentFormData) => (
  sendJson<{ token: string }>('/auth/register', token, 'POST', {
    ...payload,
    maternalSurname: payload.maternalSurname || null,
    phone: payload.phone || null,
    role: collaboratorRole,
  })
)

export const toggleUserStatus = (token: string, userId: number) => (
  sendVoid(`/users/${userId}/toggle-status`, token, 'PATCH')
)
