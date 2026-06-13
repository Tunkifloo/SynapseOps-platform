import { useState, type ChangeEvent, type FormEvent } from 'react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/lib/utils'

import type { WorkspaceFormData } from '../types'

interface WorkspaceFormProps {
  form: WorkspaceFormData
  editingWorkspaceId: number | null
  isSaving: boolean
  onChange: (
    field: keyof WorkspaceFormData
  ) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}

const MAX_NAME = 60

export function WorkspaceForm({
  form,
  editingWorkspaceId,
  isSaving,
  onChange,
  onSubmit,
  onCancel,
}: WorkspaceFormProps) {
  const [touched, setTouched] = useState(false)

  const nameError = !form.name.trim()
    ? 'El nombre del proyecto es obligatorio.'
    : form.name.trim().length > MAX_NAME
      ? `Máximo ${MAX_NAME} caracteres.`
      : null
  const showNameError = touched && nameError

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    setTouched(true)
    if (nameError) {
      event.preventDefault()
      return
    }
    void onSubmit(event)
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">Nombre del proyecto</Label>
        <Input
          id="ws-name"
          value={form.name}
          onChange={onChange('name')}
          onBlur={() => setTouched(true)}
          placeholder="Clasificador de imágenes"
          autoFocus
          aria-invalid={showNameError ? true : undefined}
          className={cn('h-10', showNameError && 'border-destructive focus-visible:ring-destructive/30')}
        />
        {showNameError && <p className="text-xs font-medium text-destructive-strong">{nameError}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ws-desc">
          Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <textarea
          id="ws-desc"
          value={form.description}
          onChange={onChange('description')}
          placeholder="Describe el propósito del proyecto"
          className="min-h-24 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out-quart placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="cta" loading={isSaving} disabled={touched && !!nameError}>
          {editingWorkspaceId ? 'Guardar cambios' : 'Crear proyecto'}
        </Button>
      </div>
    </form>
  )
}
