import type { Role } from '@/types'

import type { JwtClaims, SessionUser } from './types'

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

export const mapTokenToSessionUser = (token: string, fallbackUsername: string): SessionUser => {
  const claims = parseJwtClaims(token)
  return {
    username: claims.sub ?? fallbackUsername,
    name: claims.sub ?? fallbackUsername,
    role: resolveRole(claims.role),
  }
}
