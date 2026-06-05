import { fetchJson, sendJson } from '@/shared/api/client'
import type { Role } from '@/types'

import type {
  CreateStudentFormData,
  UserPasswordUpdatePayload,
  UserProfileUpdatePayload,
  UserSummary,
  UserUpdatePayload,
} from './types'
import { collaboratorRole, isCollaboratorUser } from './types'

const mapUserSummary = (user: UserSummary): UserSummary => ({
  ...user,
  career: user.career ?? (user as unknown as { carrer?: string }).carrer ?? null,
})

const mapUserList = (users: UserSummary[]) => users.map(mapUserSummary)

export const listUsers = (token: string) => (
  fetchJson<UserSummary[]>('/users', token).then(mapUserList)
)

export const listUsersByRole = (token: string, role: Role) => (
  fetchJson<UserSummary[]>(`/users/role/${role}`, token).then(mapUserList)
)

export const listCollaborators = (token: string) => (
  listUsersByRole(token, collaboratorRole)
)

export const listDisabledUsers = (token: string) => (
  fetchJson<UserSummary[]>('/users/disabled', token)
    .then(mapUserList)
    .then((users) => users.filter(isCollaboratorUser))
)

export const getUserById = (token: string, userId: number) => (
  fetchJson<UserSummary>(`/users/${userId}`, token).then(mapUserSummary)
)

export const updateUserByAdmin = (token: string, userId: number, payload: UserUpdatePayload) => (
  sendJson<UserSummary>(`/users/${userId}`, token, 'PUT', {
    name: payload.name,
    paternalSurname: payload.paternalSurname,
    maternalSurname: payload.maternalSurname,
    dni: payload.dni || null,
    email: payload.email,
    phone: payload.phone || null,
    role: payload.role,
  }).then(mapUserSummary)
)

export const getMyProfile = (token: string) => (
  fetchJson<UserSummary>('/users/me', token).then(mapUserSummary)
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

export const setUserStatus = (token: string, userId: number, enabled: boolean) => (
  sendJson<UserSummary>(`/users/${userId}`, token, 'PATCH', { enabled }).then(mapUserSummary)
)
