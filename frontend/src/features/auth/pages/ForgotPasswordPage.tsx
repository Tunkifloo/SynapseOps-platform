import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, IdCard, Lock, Mail, User } from 'lucide-react'

import { forgotPassword } from '@/features/auth/api'
import { validateEmail, validatePassword, validateRequired } from '@/features/auth/validation'
import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/lib/utils'

/** La contraseña en recuperación admite mínimo 6 caracteres (DTO ForgotPasswordRequest). */
const MIN_NEW_PASSWORD = 6

type Field = 'username' | 'email' | 'newPassword'

export function ForgotPasswordPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [studentCode, setStudentCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [touched, setTouched] = useState<Record<Field, boolean>>({
    username: false,
    email: false,
    newPassword: false,
  })
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()

  // Validaciones según el DTO del backend (username, email requeridos; newPassword ≥ 6).
  const usernameError = validateRequired(username, 'El usuario')
  const emailError = validateEmail(email)
  const passwordError = validatePassword(newPassword, MIN_NEW_PASSWORD)

  const show = (field: Field, err: string | null) => ((touched[field] || submitAttempted) && err) || null
  const markTouched = (field: Field) => () => setTouched((t) => ({ ...t, [field]: true }))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitAttempted(true)
    setError('')
    setSuccess('')
    if (usernameError || emailError || passwordError) return

    setIsLoading(true)
    try {
      await forgotPassword(username.trim(), email.trim(), newPassword, studentCode)
      setSuccess('Contraseña restablecida con éxito.')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.')
    } finally {
      setIsLoading(false)
    }
  }

  const usernameErr = show('username', usernameError)
  const emailErr = show('email', emailError)
  const passwordErr = show('newPassword', passwordError)

  return (
    <div className="bg-dots flex min-h-[100svh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:ease-out-quart motion-safe:[animation-duration:280ms]">
        <div className="border-b border-border bg-secondary/40 px-8 pt-9 pb-7 text-center">
          <div className="mb-4 flex justify-center">
            <Brand size="xl" showWordmark={false} />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Restablecer contraseña
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verifica tu identidad y define una nueva contraseña.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4 p-8">
          <div className="space-y-1.5">
            <Label htmlFor="fp-user">Usuario</Label>
            <div className="relative">
              <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fp-user"
                type="text"
                value={username}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                onBlur={markTouched('username')}
                placeholder="superadmin"
                autoComplete="username"
                aria-invalid={usernameErr ? true : undefined}
                className={cn('h-11 pl-10', usernameErr && 'border-destructive focus-visible:ring-destructive/30')}
              />
            </div>
            {usernameErr && <p className="text-xs font-medium text-destructive-strong">{usernameErr}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fp-email">Correo</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fp-email"
                type="email"
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                onBlur={markTouched('email')}
                placeholder="jane.doe@university.edu"
                autoComplete="email"
                aria-invalid={emailErr ? true : undefined}
                className={cn('h-11 pl-10', emailErr && 'border-destructive focus-visible:ring-destructive/30')}
              />
            </div>
            {emailErr && <p className="text-xs font-medium text-destructive-strong">{emailErr}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fp-code">
              Código de estudiante{' '}
              <span className="font-normal text-muted-foreground">(requerido si eres estudiante)</span>
            </Label>
            <div className="relative">
              <IdCard className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fp-code"
                type="text"
                value={studentCode}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setStudentCode(e.target.value)}
                inputMode="numeric"
                className="h-11 pl-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fp-pass">Nueva contraseña</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fp-pass"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                onBlur={markTouched('newPassword')}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={passwordErr ? true : undefined}
                className={cn('h-11 pl-10 pr-11', passwordErr && 'border-destructive focus-visible:ring-destructive/30')}
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
            {passwordErr && <p className="text-xs font-medium text-destructive-strong">{passwordErr}</p>}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive-strong motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150"
            >
              {error}
            </p>
          )}
          {success && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm font-medium text-success-strong motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              {success}
            </p>
          )}

          <Button type="submit" variant="cta" size="lg" loading={isLoading} className="w-full">
            {isLoading ? 'Restableciendo…' : 'Confirmar nueva contraseña'}
          </Button>

          <Link
            to="/login"
            className="flex items-center justify-center gap-2 rounded text-sm font-medium text-muted-foreground transition-colors duration-150 ease-out-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4" />
            Volver al inicio de sesión
          </Link>
        </form>
      </div>
    </div>
  )
}
