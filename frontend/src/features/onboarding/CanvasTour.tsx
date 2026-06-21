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
    body: 'Estos son los 6 bloques de tu flujo. Arrástralos (o tócalos) al lienzo y conéctalos de izquierda a derecha, en orden. Te explico cada uno.',
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
    sel: '[data-tour="node-hparams"]',
    title: '4 · Hiperparámetros',
    body: 'Define el modelo: la Arquitectura (CNN desde cero o preentrenadas EfficientNet/MobileNet/ResNet) y cómo se eligen los hiperparámetros. Recomendado: «Optimización automática (HPO)» — Optuna prueba varias combinaciones y entrena con la mejor, sin que ajustes nada. Avanzado: desactívalo para fijar learning rate, optimizador, Dropout y L2 a tu criterio.',
  },
  {
    sel: '[data-tour="node-hparams"]',
    title: 'Transfer Learning (arquitecturas preentrenadas)',
    body: 'Si eliges una arquitectura preentrenada y ajuste manual, aparecen sus parámetros: epochs y learning rate de Feature Extraction (cabeza nueva, backbone congelado) y de Fine-Tuning (descongela las últimas N capas con LR muy bajo). Con HPO activado, el sistema los elige por ti.',
  },
  {
    sel: '[data-tour="node-train"]',
    title: '5 · Entrenamiento',
    body: 'Ejecuta el entrenamiento con la arquitectura e hiperparámetros del nodo anterior. Aquí defines el Framework (TF/PyTorch), el Batch size, Batch Norm y Early Stopping, y el nombre del modelo. El nº de clases se autodetecta.',
  },
  {
    sel: '[data-tour="node-deploy"]',
    title: '6 · Despliegue (opcional)',
    body: 'Publica el modelo entrenado como servicio de inferencia (/predict). El puerto se asigna solo; luego puedes probarlo subiendo imágenes desde «Despliegues». Es opcional: puedes entrenar sin desplegar.',
  },
  {
    sel: '[data-tour="canvas"]',
    title: 'Arma y conecta tu flujo',
    body: 'Conéctalos EN ORDEN: Ingesta → Preprocesamiento → Split → Hiperparámetros → Entrenamiento. El Despliegue es opcional (al final, desde Entrenamiento). Cada bloque va unido al siguiente: no se permite saltar pasos. Toca un nodo para configurarlo; toca una línea para desconectarla. Si falta algo o está mal unido, «Iniciar flujo» te dirá exactamente qué corregir.',
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

  // Fondo BLUR con HUECO sobre el objetivo. Claves de UX/z-index:
  //  • Solo blur (tinte sutil del tema), NO un velo blanco.
  //  • z-[45]: por ENCIMA del contenido/header (resalta el objetivo) pero por DEBAJO de los
  //    diálogos de la app (z-50). Así, cuando una acción abre un modal (crear espacio/pipeline),
  //    el modal se ve NÍTIDO por encima del blur en vez de quedar tapado.
  //  • El hueco deja el componente a interactuar sin blur y clicable (overlay pointer-events-none).
  const PAD = 6
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const blurCls =
    'pointer-events-none fixed z-[45] bg-background/30 backdrop-blur-sm transition-all duration-200 ease-out-quart'
  const hole = rect
    ? {
        top: Math.max(0, rect.top - PAD),
        left: Math.max(0, rect.left - PAD),
        right: Math.min(vw, rect.right + PAD),
        bottom: Math.min(vh, rect.bottom + PAD),
      }
    : null

  return (
    <div aria-live="polite">
      {hole ? (
        <>
          {/* 4 rectángulos de blur alrededor del objetivo → dejan un hueco nítido y clicable. */}
          <div className={blurCls} style={{ top: 0, left: 0, width: '100%', height: hole.top }} />
          <div className={blurCls} style={{ top: hole.bottom, left: 0, width: '100%', height: Math.max(0, vh - hole.bottom) }} />
          <div className={blurCls} style={{ top: hole.top, left: 0, width: hole.left, height: hole.bottom - hole.top }} />
          <div className={blurCls} style={{ top: hole.top, left: hole.right, width: Math.max(0, vw - hole.right), height: hole.bottom - hole.top }} />
          {/* Anillo del objetivo. */}
          <div
            className="pointer-events-none fixed z-[46] rounded-xl ring-2 ring-primary transition-all duration-200 ease-out-quart"
            style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }}
          />
        </>
      ) : (
        <div className={blurCls} style={{ top: 0, left: 0, width: '100%', height: '100%' }} />
      )}

      {/* Tarjeta del paso — z-[55]: por ENCIMA de los diálogos para que la guía siga visible. */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className="pointer-events-auto fixed z-[55] max-h-[80vh] w-80 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
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
