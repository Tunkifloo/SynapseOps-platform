import { HelpCircle } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

interface FieldHelpProps {
  /** Texto de ayuda (qué es · para qué sirve · recomendación). */
  text: string
  /** Etiqueta del campo/nodo, para el título del popover y el aria-label. */
  label?: string
  className?: string
}

/**
 * Ícono «?» que abre un popover con la ayuda al CLIC/TAP (no hover) → accesible en
 * desktop, móvil (táctil) y teclado. Radix gestiona portal, posición, cierre por clic
 * fuera y Escape. Mantiene los paneles despejados: la ayuda solo aparece a demanda.
 */
export function FieldHelp({ text, label, className }: FieldHelpProps) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={label ? `Ayuda: ${label}` : 'Ayuda'}
          className={cn(
            'inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            className,
          )}
        >
          <HelpCircle className="size-4" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="left"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] w-64 rounded-lg border border-border bg-card p-3 text-xs leading-relaxed shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
        >
          {label && (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
              {label}
            </p>
          )}
          <p className="text-muted-foreground">{text}</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
