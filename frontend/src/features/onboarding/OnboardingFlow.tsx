import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppStore } from '@/store/useAppStore'
import { completeOnboarding, getOnboardingStatus } from './api'
import { WelcomeModal } from './WelcomeModal'
import { CanvasTour } from './CanvasTour'

/**
 * Orquesta el onboarding guiado (Ticket UX-5): consulta el estado al backend una vez
 * por sesión; si el usuario no lo completó, muestra el modal de bienvenida y luego el
 * recorrido por el Lienzo. La fase vive en el store (persistida) para sobrevivir a la
 * navegación welcome→/builder→tour. Marca completado (backend) al finalizar u omitir.
 */
export function OnboardingFlow({ token }: { token: string }) {
  const phase = useAppStore((s) => s.onboardingPhase)
  const setPhase = useAppStore((s) => s.setOnboardingPhase)
  const navigate = useNavigate()
  const checked = useRef(false)

  useEffect(() => {
    if (phase !== null || checked.current || !token) return
    checked.current = true
    getOnboardingStatus(token)
      .then((s) => setPhase(s.completed ? 'done' : 'welcome'))
      .catch(() => setPhase('done')) // ante error/permiso, no interrumpir al usuario
  }, [phase, token, setPhase])

  const finish = useCallback(() => {
    setPhase('done')
    void completeOnboarding(token).catch(() => {})
  }, [token, setPhase])

  if (phase === 'welcome') {
    return (
      <WelcomeModal
        onSkip={finish}
        onStart={() => {
          setPhase('tour')
          navigate('/workspaces') // el flujo guía: crear espacio → ir al Lienzo → pipeline
        }}
      />
    )
  }
  if (phase === 'tour') {
    return <CanvasTour onFinish={finish} />
  }
  return null
}
