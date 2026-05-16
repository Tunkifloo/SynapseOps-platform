import type { Role } from '@/types'

export const collaboratorRole: Role = 'COLLABORATOR'

export const isCollaboratorUser = <T extends { role: Role }>(user: T) => user.role === collaboratorRole

export interface UserSummary {
  idUser: number
  username: string
  name: string
  email: string
  role: Role
  paternalSurname: string
  maternalSurname: string
  phone: string | null
  enabled: boolean
  studentCode: string | null
  career: string | null
}

export interface UserUpdatePayload {
  name: string
  paternalSurname: string
  maternalSurname: string
  dni: string
  email: string
  phone: string
  role: Role
  studentCode: string
  career: string
}

export interface UserProfileUpdatePayload {
  name: string
  paternalSurname: string
  maternalSurname: string
  phone: string
}

export interface UserPasswordUpdatePayload {
  currentPassword: string
  newPassword: string
}

export interface CreateStudentFormData {
  username: string
  password: string
  name: string
  paternalSurname: string
  maternalSurname: string
  email: string
  phone: string
  role: Role
  studentCode: string
  career: string
}

export const emptyStudentForm = (): CreateStudentFormData => ({
  username: '',
  password: '',
  name: '',
  paternalSurname: '',
  maternalSurname: '',
  email: '',
  phone: '',
  role: 'COLLABORATOR',
  studentCode: '',
  career: '',
})

export const emptyUserUpdatePayload = (): UserUpdatePayload => ({
  name: '',
  paternalSurname: '',
  maternalSurname: '',
  dni: '',
  email: '',
  phone: '',
  role: 'COLLABORATOR',
  studentCode: '',
  career: '',
})
