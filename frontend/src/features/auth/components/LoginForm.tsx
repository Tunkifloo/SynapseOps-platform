import { useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, GraduationCap, Lock, User } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/lib/utils'

interface LoginFormProps {
  credential: string
  password: string
  error: string
  isLoading: boolean
  onCredentialChange: (event: ChangeEvent<HTMLInputElement>) => void
  onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

export function LoginForm({
  credential,
  password,
  error,
  isLoading,
  onCredentialChange,
  onPasswordChange,
  onSubmit,
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState({ credential: false, password: false })

  const credentialError =
    touched.credential && !credential.trim() ? 'El usuario o correo es obligatorio.' : null
  const passwordError = touched.password && !password ? 'La contraseña es obligatoria.' : null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setTouched({ credential: true, password: true })
    if (!credential.trim() || !password) {
      event.preventDefault()
      return
    }
    void onSubmit(event)
  }

  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-background p-4 md:p-8">
      <div className="flex w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:ease-out-quart motion-safe:[animation-duration:280ms] md:min-h-[620px] md:flex-row">
        {/* ── Panel de marca (navy) ─────────────────────────────────────── */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-sidebar p-8 text-white md:w-5/12 md:p-12">
          <div
            className="pointer-events-none absolute -top-1/4 -left-1/4 h-[120%] w-[120%] bg-[radial-gradient(ellipse_at_top_left,rgba(255,106,0,0.22),transparent_60%)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-1/4 -bottom-1/4 h-full w-full bg-[radial-gradient(circle_at_bottom_right,rgba(0,187,255,0.18),transparent_55%)]"
            aria-hidden="true"
          />

          <div className="relative z-10">
            <Brand size="lg" tone="invert" className="mb-12" />
            <h1 className="font-heading text-4xl leading-tight font-bold tracking-tight md:text-5xl">
              Construye modelos.
              <br />
              No infraestructura.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/70">
              Gestión low-code del ciclo de vida MLOps. La plataforma cercana, pensada para que los
              estudiantes cierren la brecha entre la teoría y la producción sin fricción.
            </p>
          </div>

          <div className="relative z-10 mt-12 flex items-center gap-3 text-sm text-white/55">
            <GraduationCap className="size-5 shrink-0" />
            <span>Impulsando a la próxima generación de científicos de datos.</span>
          </div>
        </div>

        {/* ── Formulario ────────────────────────────────────────────────── */}
        <div className="flex flex-col justify-center bg-card p-8 md:w-7/12 md:p-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-9 text-center md:text-left">
              <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground">
                Bienvenido de nuevo
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ingresa tus credenciales para acceder a tu espacio de trabajo.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* Usuario o correo */}
              <div className="space-y-1.5">
                <label htmlFor="credential" className="text-sm font-semibold text-foreground">
                  Usuario o correo
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="credential"
                    type="text"
                    value={credential}
                    onChange={onCredentialChange}
                    onBlur={() => setTouched((t) => ({ ...t, credential: true }))}
                    placeholder="superadmin"
                    autoComplete="username"
                    aria-invalid={credentialError ? true : undefined}
                    className={cn(
                      'h-12 pl-10',
                      credentialError && 'border-destructive focus-visible:ring-destructive/30'
                    )}
                    required
                  />
                </div>
                {credentialError && (
                  <p className="text-xs font-medium text-destructive-strong">{credentialError}</p>
                )}
              </div>

              {/* Contraseña */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-semibold text-foreground">
                    Contraseña
                  </label>
                  <Link
                    to="/forgot-password"
                    className="rounded text-sm font-medium text-cta-strong transition-colors duration-150 ease-out-quart hover:text-cta-strong/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={onPasswordChange}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    aria-invalid={passwordError ? true : undefined}
                    className={cn(
                      'h-12 pl-10 pr-11',
                      passwordError && 'border-destructive focus-visible:ring-destructive/30'
                    )}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors duration-150 ease-out-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-xs font-medium text-destructive-strong">{passwordError}</p>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive-strong motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="cta"
                size="lg"
                loading={isLoading}
                className="h-12 w-full text-base"
              >
                {isLoading ? (
                  'Autenticando…'
                ) : (
                  <>
                    Iniciar sesión
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              ¿No tienes cuenta?{' '}
              <Link to="/signup" className="rounded font-semibold text-primary-strong transition-colors duration-150 ease-out-quart hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                Regístrate
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
