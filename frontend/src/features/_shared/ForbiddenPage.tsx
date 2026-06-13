import { Link } from 'react-router-dom'
import { Home, ShieldAlert } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'

/**
 * Estado 403 (acceso restringido por rol). Theme-aware y con salida clara
 * ("siguiente paso"): el usuario siempre puede volver a una zona permitida.
 */
export function ForbiddenPage() {
  return (
    <div className="bg-dots flex min-h-[100svh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:ease-out-quart motion-safe:[animation-duration:280ms]">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive-strong ring-1 ring-destructive/20">
          <ShieldAlert className="size-7" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-destructive-strong">Error 403</p>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground">Acceso restringido</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          Tu perfil no tiene permisos para acceder a este módulo. Si crees que es un error, contacta a un administrador.
        </p>
        <Button asChild variant="cta" size="lg" className="mt-6">
          <Link to="/dashboard">
            <Home />
            Volver al inicio
          </Link>
        </Button>
      </div>
    </div>
  )
}
