import type { ChangeEvent, FormEvent } from 'react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

import type { WorkspaceFormData } from '../types'

interface WorkspaceFormProps {
  form: WorkspaceFormData
  editingWorkspaceId: number | null
  isSaving: boolean
  onChange: (field: keyof WorkspaceFormData) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{children}</label>
}

export function WorkspaceForm({ form, editingWorkspaceId, isSaving, onChange, onSubmit, onCancel }: WorkspaceFormProps) {
  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <div className="space-y-2">
        <FieldLabel>Nombre del proyecto</FieldLabel>
        <Input
          value={form.name}
          onChange={onChange('name')}
          required
          className="h-10 rounded-xl border-slate-700/80 bg-slate-950/40 text-sm text-slate-100 focus-visible:ring-blue-500/20"
        />
      </div>
      <div className="space-y-2">
        <FieldLabel>Descripción</FieldLabel>
        <textarea
          value={form.description}
          onChange={onChange('description')}
          placeholder="Describe el propósito del proyecto"
          className="min-h-24 w-full rounded-xl border border-slate-700/80 bg-slate-950/40 px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/20"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-500">
          {isSaving ? 'Guardando...' : editingWorkspaceId ? 'Actualizar' : 'Crear'}
        </Button>
        {editingWorkspaceId && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}
