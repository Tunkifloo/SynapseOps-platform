import { useEffect, useState, type CSSProperties } from 'react'

import { Button } from '@/shared/components/ui/button'

interface CanvasTourProps {
  /** Finalizar u omitir el tour (marca el onboarding como completado). */
  onFinish: () => void
}

interface TourStep {
  sel: string
  title: string
  body: string
  /** Si aparece este elemento, el paso se completó (acción del usuario) y se auto-avanza. */
  advanceWhen?: string
}

const STEPS: TourStep[] = [
  {
    sel: '[data-tour="create-workspace"]',
    title: 'Paso 1 · Crea tu espacio de trabajo',
    body: 'Estás en «Espacios de trabajo». Pulsa «Crear nuevo espacio», ponle un nombre y créalo (luego podrás asignarle un dataset). Avanzaré solo cuando exista tu espacio.',
    advanceWhen: '[data-tour="workspace-item"]',
  },
  {
    sel: '[data-tour="nav-builder"]',
    title: 'Paso 2 · Abre el Lienzo',
    body: '¡Espacio creado! Ahora abre el «Lienzo» desde el menú lateral para diseñar tu pipeline. Avanzaré cuando estés en el Lienzo.',
    advanceWhen: '[data-tour="create-pipeline"], [data-tour="nodes"]',
  },
  {
    sel: '[data-tour="create-pipeline"]',
    title: 'Paso 3 · Crea un pipeline',
    body: 'El Lienzo se vincula a un pipeline. Pulsa «Crear pipeline» para empezar a diseñar tu flujo. Avanzaré en cuanto se cree.',
    advanceWhen: '[data-tour="nodes"]',
  },
  {
    sel: '[data-tour="nodes"]',
    title: 'Bloques del pipeline',
    body: 'Estos son los 5 bloques de tu flujo. Arrástralos (o tócalos) al lienzo y conéctalos de izquierda a derecha. Te explico cada uno.',
  },
  {
    sel: '[data-tour="node-ingest"]',
    title: '1 · Ingesta — cargar dataset',
    body: 'Define de dónde salen tus imágenes: un dataset integrado (Keras), una URL .zip o un .zip que subas. Es el inicio del flujo.',
  },
  {
    sel: '[data-tour="node-preprocess"]',
    title: '2 · Preprocesamiento',
    body: 'Prepara las imágenes. Configurable: Normalización (escala de píxeles), Tamaño de imagen, Data Augmentation (10 técnicas: flip, rotación, brillo, zoom, ruido…) y Balanceo de clases (corrige clases desbalanceadas). Cada opción tiene su ayuda (ⓘ) en el panel.',
  },
  {
    sel: '[data-tour="node-split"]',
    title: '3 · Split — train / val / test',
    body: 'Divide el dataset. Configuras el % de entrenamiento (50–90%); el resto se reparte automáticamente entre validación y test (held-out para métricas honestas).',
  },
  {
    sel: '[data-tour="node-train"]',
    title: '4 · Entrenamiento',
    body: 'El corazón del flujo. Eliges Framework (TF/PyTorch) y Arquitectura: CNN desde cero o preentrenadas (EfficientNet/MobileNet/ResNet) con Transfer Learning en 2 fases. Ajustas optimizador, epochs, batch, learning rate, Dropout y L2 (regularización), Batch Norm y Early Stopping. Recuerda nombrar tu modelo.',
  },
  {
    sel: '[data-tour="node-train"]',
    title: 'Transfer Learning (arquitecturas nuevas)',
    body: 'Al elegir una arquitectura preentrenada aparecen sus parámetros: epochs y learning rate de Feature Extraction (cabeza nueva, backbone congelado) y de Fine-Tuning (descongela las últimas N capas con LR muy bajo). El tamaño se ajusta a 224px automáticamente.',
  },
  {
    sel: '[data-tour="node-deploy"]',
    title: '5 · Despliegue',
    body: 'Publica el modelo entrenado como servicio de inferencia (/predict). El puerto se asigna solo; luego puedes probarlo subiendo imágenes desde «Despliegues».',
  },
  {
    sel: '[data-tour="canvas"]',
    title: 'Arma y conecta tu flujo',
    body: 'Suelta los bloques aquí y conéctalos de izquierda a derecha. Toca un nodo para abrir su panel y configurar sus parámetros (cada campo trae su ayuda).',
  },
  {
    sel: '[data-tour="start-flow"]',
    title: 'Inicia el entrenamiento',
    body: 'Cuando tu flujo esté listo, pulsa «Iniciar flujo». Verás el progreso por época (y las fases de Transfer Learning) en la consola de logs.',
  },
]

const CARD_W = 320

const FIRST_INFO = STEPS.findIndex((s) => !s.advanceWhen)

export function CanvasTour({ onFinish }: CanvasTourProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]
  // Pasos de ACCIÓN (con advanceWhen): el usuario debe hacer la acción; no se pueden
  // saltar con "Siguiente" — avanzan solos cuando la acción se completa.
  const isAction = !!current.advanceWhen

  // Recalcula la posición del objetivo periódicamente: tolera el montaje tardío del
  // lienzo (al venir del modal de bienvenida) y los cambios de layout (scroll/resize).
  useEffect(() => {
    const update = () => {
      // Elige el primer elemento VISIBLE que coincida (hay anclajes duplicados
      // desktop/móvil; el oculto mide 0×0 y se descarta → card centrada si no hay).
      const els = Array.from(document.querySelectorAll(current.sel)) as HTMLElement[]
      const el = els.find((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      setRect(el ? el.getBoundingClientRect() : null)
      // Auto-avance: si la acción del usuario ya se completó (aparece el anclaje del
      // siguiente contexto), pasa al próximo paso. Hace el tour adaptativo al estado real.
      if (current.advanceWhen && document.querySelector(current.advanceWhen)) {
        setStep((s) => (s < STEPS.length - 1 ? s + 1 : s))
      }
    }
    update()
    const id = window.setInterval(update, 250)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [current.sel, current.advanceWhen])

  // Posición de la tarjeta: debajo del objetivo si cabe, si no encima; centrada si no hay anclaje.
  let cardStyle: CSSProperties
  if (rect) {
    const below = rect.bottom + 12
    const placeBelow = below + 180 < window.innerHeight
    cardStyle = {
      top: placeBelow ? below : Math.max(12, rect.top - 192),
      left: Math.min(Math.max(12, rect.left), window.innerWidth - CARD_W - 12),
    }
  } else {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  // pointer-events-none en el overlay → NO bloquea la UI real; el usuario puede pulsar
  // el botón resaltado. Solo la tarjeta recupera los eventos (pointer-events-auto).
  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" aria-live="polite">
      {/* Spotlight: oscurece todo menos el objetivo (box-shadow gigante). No bloquea clics. */}
      {rect && (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-primary transition-all duration-200 ease-out-quart"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px color-mix(in oklch, var(--foreground) 45%, transparent)',
          }}
        />
      )}
      {!rect && (
        <div className="pointer-events-none fixed inset-0 bg-foreground/45" />
      )}

      {/* Tarjeta del paso */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="pointer-events-auto fixed max-h-[80vh] w-80 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
        style={cardStyle}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-strong">
          Paso {step + 1} de {STEPS.length}
        </p>
        <h3 id="tour-title" className="mt-1 text-sm font-semibold text-foreground">
          {current.title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{current.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onFinish}>
            Omitir
          </Button>
          {isAction ? (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
              Esperando tu acción…
            </span>
          ) : (
            <div className="flex items-center gap-2">
              {step > FIRST_INFO && (
                <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                  Atrás
                </Button>
              )}
              {isLast ? (
                <Button variant="cta" size="sm" onClick={onFinish}>
                  Finalizar
                </Button>
              ) : (
                <Button variant="cta" size="sm" onClick={() => setStep((s) => s + 1)}>
                  Siguiente
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
