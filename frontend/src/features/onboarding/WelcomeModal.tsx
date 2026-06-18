import { useState } from 'react'
import { Boxes, GitBranch, Rocket, Sparkles, X } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'

interface WelcomeModalProps {
  /** Omitir el onboarding (marca completado). */
  onSkip: () => void
  /** Empezar el recorrido guiado en el Lienzo. */
  onStart: () => void
}

const STEPS = [
  {
    icon: Sparkles,
    title: 'Bienvenido a SynapseOps',
    body: 'Una plataforma low-code de MLOps: entrena, versiona y despliega modelos de visión por computadora desde el navegador, sin escribir código.',
  },
  {
    icon: Boxes,
    title: 'El Lienzo de pipelines',
    body: 'Construyes tu flujo arrastrando bloques: Ingesta → Preprocesamiento → Split → Entrenamiento → Despliegue. Los conectas de izquierda a derecha.',
  },
  {
    icon: GitBranch,
    title: 'Entrena y versiona automáticamente',
    body: 'Al iniciar el flujo, tu modelo se entrena (CNN o redes preentrenadas) y se registra solo, con sus métricas, drift e interpretabilidad.',
  },
  {
    icon: Rocket,
    title: 'Tu primer modelo, paso a paso',
    body: 'Te llevamos al Lienzo y te guiamos por los pasos clave para que ejecutes tu primer experimento con éxito.',
  },
]

/** Modal de bienvenida post-registro (Ticket UX-5, fase 1). */
export function WelcomeModal({ onSkip, onStart }: WelcomeModalProps) {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]
  const Icon = current.icon

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200">
        <button
          type="button"
          onClick={onSkip}
          aria-label="Omitir tutorial"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 ease-out-quart hover:bg-accent/40 hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col items-center gap-4 px-6 pb-6 pt-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-7" />
          </div>
          <h2 id="welcome-title" className="text-lg font-semibold text-foreground">
            {current.title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.body}</p>

          {/* Indicador de pasos */}
          <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ease-out-quart ${
                  i === step ? 'w-5 bg-primary' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-card/60 px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Omitir
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                Atrás
              </Button>
            )}
            {isLast ? (
              <Button variant="cta" size="sm" onClick={onStart}>
                Empezar
              </Button>
            ) : (
              <Button variant="cta" size="sm" onClick={() => setStep((s) => s + 1)}>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
