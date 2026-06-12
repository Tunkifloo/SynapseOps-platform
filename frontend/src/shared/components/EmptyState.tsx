import type { ComponentType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  /** Acción opcional (botón) bajo el texto. */
  action?: ReactNode
  className?: string
}

/**
 * Estado vacío consistente (icono en píldora + título + descripción + CTA opcional).
 * Mismo lenguaje visual en todos los módulos; usa los tokens de tema aprobados.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="size-6" />
      </span>
      <div>
        <p className="font-heading text-base font-semibold text-foreground">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
