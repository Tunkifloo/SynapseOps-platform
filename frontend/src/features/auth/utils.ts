import type { Role } from '@/types'

import type { JwtClaims } from './types'

export const parseJwtClaims = (token: string): JwtClaims => {
  const [, payload] = token.split('.')

  if (!payload) {
    throw new Error('Invalid token payload')
  }

  const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
  const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=')

  return JSON.parse(atob(paddedPayload)) as JwtClaims
}

export const resolveRole = (role?: string): Role => role === 'ADMIN' ? 'ADMIN' : 'COLLABORATOR'
