import { Link } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

/**
 * Estado 404 (ruta inexistente). Theme-aware y con salida clara: lleva al usuario
 * a su zona inicial según su sesión (dashboard si está autenticado, login si no).
 */
export function NotFoundPage() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const home = isAuthenticated ? '/dashboard' : '/login'

  return (
    <div className="bg-dots flex min-h-[100svh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:ease-out-quart motion-safe:[animation-duration:280ms]">
        <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary-strong ring-1 ring-primary/20">
          <Compass className="size-7" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-strong">Error 404</p>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground">Página no encontrada</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          La dirección que buscas no existe o se movió. Vuelve a un lugar conocido para continuar.
        </p>
        <Button asChild variant="cta" size="lg" className="mt-6">
          <Link to={home}>
            <Home />
            {isAuthenticated ? 'Ir al inicio' : 'Ir a iniciar sesión'}
          </Link>
        </Button>
      </div>
    </div>
  )
}
