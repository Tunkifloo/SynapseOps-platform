import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Eye, EyeOff, Workflow } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { signup } from '@/features/auth/api'
import type { SignupPayload } from '@/features/auth/types'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { isApiError } from '@/shared/api/client'
import { notify } from '@/shared/notify'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

type Form = SignupPayload & { confirmPassword: string }

const emptyForm: Form = {
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

export function SignUpPage() {
  const [form, setForm] = useState<Form>(emptyForm)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const set = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const validate = (): string | null => {
    const required: [keyof Form, string][] = [
      ['username', 'el usuario'],
      ['name', 'el nombre'],
      ['paternalSurname', 'el apellido paterno'],
      ['email', 'el correo'],
      ['studentCode', 'el código de estudiante'],
      ['career', 'la carrera'],
      ['password', 'la contraseña'],
    ]
    for (const [key, label] of required) {
      if (!String(form[key]).trim()) return `Falta ${label}.`
    }
    if (!EMAIL_RE.test(form.email)) return 'El formato del correo no es válido.'
    if (form.phone && !/^\d{9}$/.test(form.phone))
      return 'El teléfono debe tener exactamente 9 dígitos.'
    if (form.password.length < MIN_PASSWORD)
      return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`
    if (form.password !== form.confirmPassword)
      return 'Las contraseñas no coinciden.'
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

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
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-x-hidden overflow-y-auto bg-background px-4 py-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px]"
        aria-hidden="true"
      />
      <Card className="relative w-full max-w-xl">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <Workflow className="size-6" />
          </div>
          <CardTitle className="text-2xl">
            Crear cuenta en Synapse<span className="text-primary">Ops</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Regístrate como estudiante para construir tus pipelines MLOps.
          </p>
        </CardHeader>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="su-name">Nombre</Label>
                <Input id="su-name" value={form.name} onChange={set('name')} autoComplete="given-name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-pat">Apellido paterno</Label>
                <Input id="su-pat" value={form.paternalSurname} onChange={set('paternalSurname')} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-mat">Apellido materno <span className="text-muted-foreground">(opcional)</span></Label>
                <Input id="su-mat" value={form.maternalSurname} onChange={set('maternalSurname')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-user">Usuario</Label>
                <Input id="su-user" value={form.username} onChange={set('username')} autoComplete="username" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-code">Código de estudiante</Label>
                <Input id="su-code" value={form.studentCode} onChange={set('studentCode')} inputMode="numeric" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-career">Carrera</Label>
                <Input id="su-career" value={form.career} onChange={set('career')} required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="su-email">Correo</Label>
                <Input id="su-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="su-pass">Contraseña</Label>
              <div className="relative">
                <Input
                  id="su-pass"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  className="pr-11"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-3.5 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="su-confirm">Confirmar contraseña</Label>
              <Input
                id="su-confirm"
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={set('confirmPassword')}
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" variant="cta" size="lg" loading={isLoading} className="w-full">
              {isLoading ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Inicia sesión
              </Link>
            </p>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}
