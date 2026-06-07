import { cn } from '@/lib/utils'
// Logo importado como asset (Vite le pone hash → versionado a prueba de caché y
// empaquetado en dist, RN-008). PNG transparente: se adapta a cualquier fondo.
import logoUrl from '@/assets/synapseops-logo.png'

interface BrandProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showWordmark?: boolean
  /** Muestra el subtítulo "MLOps Platform" bajo el wordmark (estilo maquetado). */
  subtitle?: boolean
  /** 'default' = texto oscuro (fondos claros) · 'invert' = texto blanco (sidebar navy). */
  tone?: 'default' | 'invert'
  className?: string
}

const LOGO_SIZE: Record<NonNullable<BrandProps['size']>, string> = {
  sm: 'size-8',
  md: 'size-11',
  lg: 'size-14',
  xl: 'size-20',
}
const TEXT_SIZE: Record<NonNullable<BrandProps['size']>, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-3xl',
}

/**
 * Marca SynapseOps: logo (neural/circuito azul+naranja) + wordmark en Poppins Bold,
 * con "Ops" en el azul de marca. Reutilizable en login, signup y sidebar.
 */
export function Brand({
  size = 'md',
  showWordmark = true,
  subtitle = false,
  tone = 'default',
  className,
}: BrandProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src={logoUrl}
        alt="SynapseOps"
        className={cn(LOGO_SIZE[size], 'shrink-0 object-contain')}
        draggable={false}
      />
      {showWordmark && (
        <div className="flex min-w-0 flex-col leading-none">
          {/* Colores de marca: "Synapse" celeste (#00BBFF) · "Ops" naranja (#FF6A00). */}
          <span className={cn('font-heading font-bold tracking-tight', TEXT_SIZE[size])}>
            <span className="text-primary">Synapse</span>
            <span className="text-cta">Ops</span>
          </span>
          {subtitle && (
            <span
              className={cn(
                'mt-1 text-[10px] font-semibold tracking-[0.16em] uppercase',
                tone === 'invert' ? 'text-white/55' : 'text-muted-foreground'
              )}
            >
              MLOps Platform
            </span>
          )}
        </div>
      )}
    </div>
  )
}
