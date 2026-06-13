import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { signup } from '@/features/auth/api'
import { validateSignup, type SignupErrors, type SignupForm } from '@/features/auth/validation'
import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { isApiError } from '@/shared/api/client'
import { notify } from '@/shared/notify'
import { cn } from '@/lib/utils'

const emptyForm: SignupForm = {
  username: '',
  name: '',
  paternalSurname: '',
  maternalSurname: '',
  email: '',
  phone: '',
  studentCode: '',
  career: '',
  password: '',
  confirmPassword: '',
}

type Touched = Partial<Record<keyof SignupForm, boolean>>

export function SignUpPage() {
  const [form, setForm] = useState<SignupForm>(emptyForm)
  const [touched, setTouched] = useState<Touched>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  // Validación reactiva (detección de cambios): se recalcula en cada tecla.
  const errors: SignupErrors = useMemo(() => validateSignup(form), [form])
  const isDirty = useMemo(
    () => (Object.keys(form) as (keyof SignupForm)[]).some((k) => form[k] !== emptyForm[k]),
    [form]
  )

  const set = (key: keyof SignupForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
  const blur = (key: keyof SignupForm) => () => setTouched((prev) => ({ ...prev, [key]: true }))

  /** Muestra el error de un campo solo si fue tocado o ya se intentó enviar. */
  const errOf = (key: keyof SignupForm): string | undefined =>
    touched[key] || submitAttempted ? errors[key] : undefined

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitAttempted(true)
    if (Object.keys(errors).length > 0) return

    setIsLoading(true)
    try {
      const { confirmPassword: _confirm, ...payload } = form
      void _confirm
      await signup(payload)
      notify.success('Cuenta creada', {
        description: 'Ya puedes iniciar sesión con tus credenciales.',
      })
      navigate('/login')
    } catch (caught) {
      // 4xx (400/409) → inline; 5xx ya muestra toast global.
      setError(
        isApiError(caught)
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'No se pudo crear la cuenta.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-dots flex min-h-[100svh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:ease-out-quart motion-safe:[animation-duration:280ms]">
        {/* Cabecera de marca */}
        <div className="border-b border-border bg-secondary/40 px-8 pt-9 pb-7 text-center">
          <div className="mb-4 flex justify-center">
            <Brand size="xl" showWordmark={false} />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Crear cuenta en <span className="text-primary">Synapse</span>
            <span className="text-cta">Ops</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Regístrate como estudiante para construir tus pipelines MLOps.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4 p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="su-name" label="Nombre" error={errOf('name')}>
              <Input
                id="su-name"
                value={form.name}
                onChange={set('name')}
                onBlur={blur('name')}
                autoComplete="given-name"
                aria-invalid={errOf('name') ? true : undefined}
                className={fieldClass(errOf('name'))}
              />
            </Field>

            <Field id="su-pat" label="Apellido paterno" error={errOf('paternalSurname')}>
              <Input
                id="su-pat"
                value={form.paternalSurname}
                onChange={set('paternalSurname')}
                onBlur={blur('paternalSurname')}
                aria-invalid={errOf('paternalSurname') ? true : undefined}
                className={fieldClass(errOf('paternalSurname'))}
              />
            </Field>

            <Field id="su-mat" label="Apellido materno" optional>
              <Input
                id="su-mat"
                value={form.maternalSurname ?? ''}
                onChange={set('maternalSurname')}
                onBlur={blur('maternalSurname')}
              />
            </Field>

            <Field id="su-user" label="Usuario" error={errOf('username')} icon={<User className="size-4" />}>
              <Input
                id="su-user"
                value={form.username}
                onChange={set('username')}
                onBlur={blur('username')}
                autoComplete="username"
                aria-invalid={errOf('username') ? true : undefined}
                className={fieldClass(errOf('username'), true)}
              />
            </Field>

            <Field id="su-code" label="Código de estudiante" error={errOf('studentCode')}>
              <Input
                id="su-code"
                value={form.studentCode}
                onChange={set('studentCode')}
                onBlur={blur('studentCode')}
                inputMode="numeric"
                aria-invalid={errOf('studentCode') ? true : undefined}
                className={fieldClass(errOf('studentCode'))}
              />
            </Field>

            <Field id="su-career" label="Carrera" error={errOf('career')}>
              <Input
                id="su-career"
                value={form.career}
                onChange={set('career')}
                onBlur={blur('career')}
                aria-invalid={errOf('career') ? true : undefined}
                className={fieldClass(errOf('career'))}
              />
            </Field>

            <Field id="su-phone" label="Teléfono" optional error={errOf('phone')}>
              <Input
                id="su-phone"
                value={form.phone ?? ''}
                onChange={set('phone')}
                onBlur={blur('phone')}
                inputMode="numeric"
                placeholder="987654321"
                aria-invalid={errOf('phone') ? true : undefined}
                className={fieldClass(errOf('phone'))}
              />
            </Field>

            <Field
              id="su-email"
              label="Correo"
              error={errOf('email')}
              icon={<Mail className="size-4" />}
              className="sm:col-span-2"
            >
              <Input
                id="su-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                onBlur={blur('email')}
                autoComplete="email"
                placeholder="jane.doe@university.edu"
                aria-invalid={errOf('email') ? true : undefined}
                className={fieldClass(errOf('email'), true)}
              />
            </Field>
          </div>

          <Field id="su-pass" label="Contraseña" error={errOf('password')} icon={<Lock className="size-4" />}>
            <Input
              id="su-pass"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              onBlur={blur('password')}
              autoComplete="new-password"
              aria-invalid={errOf('password') ? true : undefined}
              className={cn(fieldClass(errOf('password'), true), 'pr-11')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors duration-150 ease-out-quart hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </Field>

          <Field id="su-confirm" label="Confirmar contraseña" error={errOf('confirmPassword')} icon={<Lock className="size-4" />}>
            <Input
              id="su-confirm"
              type={showPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              onBlur={blur('confirmPassword')}
              autoComplete="new-password"
              aria-invalid={errOf('confirmPassword') ? true : undefined}
              className={fieldClass(errOf('confirmPassword'), true)}
            />
          </Field>

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
            disabled={submitAttempted && Object.keys(errors).length > 0}
            className="w-full"
          >
            {isLoading ? 'Creando cuenta…' : 'Crear cuenta'}
          </Button>

          {isDirty && !isLoading && (
            <p className="text-center text-xs text-muted-foreground">Tienes cambios sin guardar.</p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="rounded font-semibold text-primary-strong transition-colors duration-150 ease-out-quart hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

/** Clase de input con marco de error y padding para icono opcional. */
function fieldClass(error: string | undefined, withIcon = false): string {
  return cn(
    'h-11',
    withIcon && 'pl-10',
    error && 'border-destructive focus-visible:ring-destructive/30'
  )
}

interface FieldProps {
  id: string
  label: string
  error?: string
  optional?: boolean
  icon?: ReactNode
  className?: string
  children: ReactNode
}

/** Envoltura de campo: label + icono opcional + input + mensaje de error. */
function Field({ id, label, error, optional, icon, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
      </Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        {children}
      </div>
      {error && <p className="text-xs font-medium text-destructive-strong">{error}</p>}
    </div>
  )
}
