import { fetchJson, sendJson } from '@/shared/api/client'

export interface OnboardingStatus {
  completed: boolean
}

/** Estado del onboarding del usuario autenticado (persistido en el backend). */
export const getOnboardingStatus = (token: string) =>
  fetchJson<OnboardingStatus>('/users/me/onboarding', token)

/** Marca el onboarding como completado/omitido (persiste entre dispositivos). */
export const completeOnboarding = (token: string) =>
  sendJson<OnboardingStatus>('/users/me/onboarding', token, 'PATCH', {})
