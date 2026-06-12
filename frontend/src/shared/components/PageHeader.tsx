import type { ComponentType, ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Icono opcional a la izquierda del título (Lucide). */
  icon?: ComponentType<{ className?: string }>
  /** Chip/etiqueta opcional junto al título (p. ej. alcance/rol). */
  badge?: ReactNode
  /** Acciones a la derecha (botones). */
  actions?: ReactNode
  className?: string
}

/**
 * Encabezado de página consistente para todos los módulos (título + subtítulo + acciones).
 * Unifica tipografía y espaciado; usa los tokens de diseño aprobados de la app.
 */
export function PageHeader({ title, subtitle, icon: Icon, badge, actions, className }: PageHeaderProps) {
  return (
    <section className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Icon className="size-5" />
            </span>
          )}
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground xl:text-3xl">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </section>
  )
}
