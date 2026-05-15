import type { ChangeEvent, FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { UserUpdatePayload } from '../types'

interface EditStudentFormProps {
  form: UserUpdatePayload
  isSubmitting: boolean
  username: string
  onChange: (field: keyof UserUpdatePayload) => (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{children}</label>
}

function FormField({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

export function EditStudentForm({ form, isSubmitting, username, onChange, onSubmit, onCancel }: EditStudentFormProps) {
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
      <div className="md:col-span-2 rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-slate-400">
        Editing student: <span className="font-semibold text-white">@{username}</span>
      </div>
      <FormField>
        <FieldLabel>Name</FieldLabel>
        <Input value={form.name} onChange={onChange('name')} required />
      </FormField>
      <FormField>
        <FieldLabel>Paternal Surname</FieldLabel>
        <Input value={form.paternalSurname} onChange={onChange('paternalSurname')} required />
      </FormField>
      <FormField>
        <FieldLabel>Maternal Surname</FieldLabel>
        <Input value={form.maternalSurname} onChange={onChange('maternalSurname')} />
      </FormField>
      <FormField>
        <FieldLabel>DNI</FieldLabel>
        <Input value={form.dni} onChange={onChange('dni')} placeholder="12345678" />
      </FormField>
      <FormField>
        <FieldLabel>Phone</FieldLabel>
        <Input value={form.phone} onChange={onChange('phone')} placeholder="999999999" />
      </FormField>
      <div className="md:col-span-2">
        <FormField>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" value={form.email} onChange={onChange('email')} required />
        </FormField>
      </div>
      <div className="md:col-span-2 flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
