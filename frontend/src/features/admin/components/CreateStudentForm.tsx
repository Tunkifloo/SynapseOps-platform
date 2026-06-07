import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { validateEmail, validatePassword, validateRequired } from '@/features/auth/validation'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/lib/utils'

import type { CreateStudentFormData } from '../types'

interface CreateStudentFormProps {
  form: CreateStudentFormData
  isEditing: boolean
  isSubmitting: boolean
  onChange: (field: keyof CreateStudentFormData) => (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCancel?: () => void
}

const MIN_PASSWORD = 7
type ErrKey = 'username' | 'password' | 'name' | 'paternalSurname' | 'studentCode' | 'email'

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string
  optional?: boolean
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
      </Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

export function CreateStudentForm({
  form,
  isEditing,
  isSubmitting,
  onChange,
  onSubmit,
  onCancel,
}: CreateStudentFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<ErrKey, boolean>>>({})

  // Validaciones (alineadas a los DTOs de creación/actualización de usuario).
  const errors: Record<ErrKey, string | null> = {
    username: isEditing ? null : validateRequired(form.username, 'El usuario'),
    password: isEditing ? null : validatePassword(form.password, MIN_PASSWORD),
    name: validateRequired(form.name, 'El nombre'),
    paternalSurname: validateRequired(form.paternalSurname, 'El apellido paterno'),
    studentCode: validateRequired(form.studentCode, 'El código de estudiante'),
    email: validateEmail(form.email),
  }
  const hasErrors = Object.values(errors).some(Boolean)

  // Detección por campo: muestra el error si el campo fue tocado o tras enviar.
  const err = (k: ErrKey) => ((submitted || touched[k]) && errors[k]) || null
  const blur = (k: ErrKey) => () => setTouched((t) => ({ ...t, [k]: true }))
  const inputCls = (k: ErrKey) => cn('h-10', err(k) && 'border-destructive focus-visible:ring-destructive/30')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setSubmitted(true)
    if (hasErrors) {
      event.preventDefault()
      return
    }
    void onSubmit(event)
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de usuario" error={err('username')}>
          <Input
            value={form.username}
            onChange={onChange('username')}
            onBlur={blur('username')}
            disabled={isEditing}
            aria-invalid={err('username') ? true : undefined}
            className={inputCls('username')}
          />
        </Field>

        <Field label="Contraseña" error={err('password')}>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={onChange('password')}
              onBlur={blur('password')}
              disabled={isEditing}
              aria-invalid={err('password') ? true : undefined}
              className={cn(inputCls('password'), 'pr-10')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              tabIndex={-1}
              disabled={isEditing}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Field label="Nombre" error={err('name')}>
          <Input
            value={form.name}
            onChange={onChange('name')}
            onBlur={blur('name')}
            aria-invalid={err('name') ? true : undefined}
            className={inputCls('name')}
          />
        </Field>

        <Field label="Apellido paterno" error={err('paternalSurname')}>
          <Input
            value={form.paternalSurname}
            onChange={onChange('paternalSurname')}
            onBlur={blur('paternalSurname')}
            aria-invalid={err('paternalSurname') ? true : undefined}
            className={inputCls('paternalSurname')}
          />
        </Field>

        <Field label="Apellido materno" optional>
          <Input value={form.maternalSurname} onChange={onChange('maternalSurname')} className="h-10" />
        </Field>

        <Field label="Teléfono" optional>
          <Input value={form.phone} onChange={onChange('phone')} placeholder="999999999" inputMode="numeric" className="h-10" />
        </Field>

        <Field label="Código de estudiante" error={err('studentCode')}>
          <Input
            value={form.studentCode}
            onChange={onChange('studentCode')}
            onBlur={blur('studentCode')}
            placeholder="U20210001"
            aria-invalid={err('studentCode') ? true : undefined}
            className={inputCls('studentCode')}
          />
        </Field>

        <Field label="Carrera" optional>
          <Input value={form.career} onChange={onChange('career')} placeholder="Ing. de Sistemas" className="h-10" />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Correo electrónico" error={err('email')}>
            <Input
              type="email"
              value={form.email}
              onChange={onChange('email')}
              onBlur={blur('email')}
              aria-invalid={err('email') ? true : undefined}
              className={inputCls('email')}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="cta" loading={isSubmitting} disabled={(submitted || Object.keys(touched).length > 0) && hasErrors}>
          {isEditing ? 'Guardar cambios' : 'Crear usuario'}
        </Button>
      </div>
    </form>
  )
}
