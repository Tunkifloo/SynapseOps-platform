import type { ChangeEvent, FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  return <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{children}</label>
}

export function WorkspaceForm({ form, editingWorkspaceId, isSaving, onChange, onSubmit, onCancel }: WorkspaceFormProps) {
  return (
    <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      <div className="space-y-2">
        <FieldLabel>Project Name</FieldLabel>
        <Input value={form.name} onChange={onChange('name')} required />
      </div>
      <div className="space-y-2">
        <FieldLabel>Description</FieldLabel>
        <textarea
          value={form.description}
          onChange={onChange('description')}
          placeholder="Describe the workspace purpose"
          className="min-h-28 w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus-visible:ring-[3px] focus-visible:ring-blue-500/30"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : editingWorkspaceId ? 'Update Project' : 'Create Project'}
        </Button>
        {editingWorkspaceId && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel Edit
          </Button>
        )}
      </div>
    </form>
  )
}
