import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

import type { CreateStudentFormData } from '../types'

interface CreateStudentFormProps {
  form: CreateStudentFormData
  isEditing: boolean
  isSubmitting: boolean
  onChange: (field: keyof CreateStudentFormData) => (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCancel?: () => void
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-[11px] sm:tracking-[0.14em]">{children}</label>
}

function FormField({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

const inputClassName = 'h-10 rounded-xl border-slate-700/80 bg-slate-950/35 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60'

export function CreateStudentForm({
  form,
  isEditing,
  isSubmitting,
  onChange,
  onSubmit,
  onCancel,
}: CreateStudentFormProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form className="space-y-4 sm:space-y-5" onSubmit={(event) => void onSubmit(event)}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-50">
          {isEditing ? 'Editar estudiante' : 'Crear estudiante'}
        </h2>
        {isEditing && (
          <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
            Modo edición
          </span>
        )}
      </div>

      {isEditing && (
        <p className="text-sm leading-6 text-slate-400">
          Estás editando la cuenta seleccionada en la tabla.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <FormField>
          <FieldLabel>Nombre de usuario</FieldLabel>
          <Input
            value={form.username}
            onChange={onChange('username')}
            required={!isEditing}
            disabled={isEditing}
            className={inputClassName}
          />
        </FormField>

        <FormField>
          <FieldLabel>Contraseña</FieldLabel>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={onChange('password')}
              minLength={7}
              required={!isEditing}
              disabled={isEditing}
              className={`${inputClassName} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 disabled:pointer-events-none"
              tabIndex={-1}
              disabled={isEditing}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>

        <FormField>
          <FieldLabel>Nombre</FieldLabel>
          <Input value={form.name} onChange={onChange('name')} required className={inputClassName} />
        </FormField>

        <FormField>
          <FieldLabel>Apellido paterno</FieldLabel>
          <Input value={form.paternalSurname} onChange={onChange('paternalSurname')} required className={inputClassName} />
        </FormField>

        <FormField>
          <FieldLabel>Apellido materno</FieldLabel>
          <Input value={form.maternalSurname} onChange={onChange('maternalSurname')} className={inputClassName} />
        </FormField>

        <FormField>
          <FieldLabel>Teléfono</FieldLabel>
          <Input value={form.phone} onChange={onChange('phone')} placeholder="999999999" className={inputClassName} />
        </FormField>

        <FormField>
          <FieldLabel>Código de estudiante</FieldLabel>
          <Input value={form.studentCode} onChange={onChange('studentCode')} placeholder="U20210001" required className={inputClassName} />
        </FormField>

        <FormField>
          <FieldLabel>Carrera</FieldLabel>
          <Input value={form.career} onChange={onChange('career')} placeholder="Ing. de Sistemas" className={inputClassName} />
        </FormField>

        <div className="xl:col-span-2">
          <FormField>
            <FieldLabel>Correo electrónico</FieldLabel>
            <Input type="email" value={form.email} onChange={onChange('email')} required className={inputClassName} />
          </FormField>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-800/80 pt-4 sm:flex-row sm:justify-end">
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="w-full border-slate-700/80 bg-slate-900/60 text-slate-200 hover:bg-slate-800 sm:w-auto"
          >
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white hover:bg-blue-500 sm:w-auto">
          {isSubmitting
            ? isEditing ? 'Guardando...' : 'Creando...'
            : isEditing ? 'Guardar cambios' : 'Crear estudiante'}
        </Button>
      </div>
    </form>
  )
}
