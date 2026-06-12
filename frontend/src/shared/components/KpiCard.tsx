import type { ComponentType, ReactNode } from 'react'

import { Card, CardContent } from '@/shared/components/ui/card'
import { cn } from '@/lib/utils'

export type KpiAccent = 'cyan' | 'sky' | 'violet' | 'amber' | 'emerald' | 'orange'

const ACCENTS: Record<KpiAccent, { icon: string; corner: string }> = {
  cyan: { icon: 'bg-primary/10 text-primary', corner: 'bg-primary/5' },
  sky: { icon: 'bg-sky-500/10 text-sky-600', corner: 'bg-sky-500/5' },
  violet: { icon: 'bg-violet-500/10 text-violet-600', corner: 'bg-violet-500/5' },
  amber: { icon: 'bg-amber-500/10 text-amber-600', corner: 'bg-amber-500/5' },
  emerald: { icon: 'bg-success/10 text-success', corner: 'bg-success/5' },
  orange: { icon: 'bg-cta/10 text-cta', corner: 'bg-cta/5' },
}

interface KpiCardProps {
  title: string
  /** Valor principal (string ya formateado o número). null/undefined → guion mientras carga. */
  value: ReactNode
  hint?: ReactNode
  icon: ComponentType<{ className?: string }>
  accent?: KpiAccent
  loading?: boolean
  /** Si se pasa, la tarjeta es navegable (cursor + hover + foco). */
  onClick?: () => void
}

/**
 * Tarjeta de indicador (KPI) consistente para dashboard y módulos. Mantiene el estilo
 * aprobado (esquina tintada + icono en píldora). Opcionalmente navegable.
 */
export function KpiCard({ title, value, hint, icon: Icon, accent = 'cyan', loading, onClick }: KpiCardProps) {
  const a = ACCENTS[accent]
  const interactive = !!onClick
  return (
    <Card
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() } : undefined}
      className={cn(
        'relative min-w-0 overflow-hidden',
        interactive && 'cursor-pointer transition-colors outline-none hover:border-primary/40 hover:bg-accent/30 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/30',
      )}
    >
      <div aria-hidden="true" className={cn('pointer-events-none absolute -top-6 -right-6 size-24 rounded-bl-[3rem]', a.corner)} />
      <CardContent className="relative">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</p>
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', a.icon)}>
            <Icon className="size-5" />
          </span>
        </div>
        <div className="font-heading text-3xl font-bold tracking-tight text-foreground">
          {loading || value === null || value === undefined
            ? <span className="text-muted-foreground/40">—</span>
            : value}
        </div>
        {hint != null && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
