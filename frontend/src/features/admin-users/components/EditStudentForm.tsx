import type { ChangeEvent, FormEvent } from 'react'
import { User as UserIcon } from 'lucide-react'

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
  return <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{children}</label>
}

function SectionTitle({ children }: { children: string }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 border-b border-white/5 pb-2">{children}</p>
}

export function EditStudentForm({ form, isSubmitting, username, onChange, onSubmit, onCancel }: EditStudentFormProps) {
  return (
    <form className="space-y-6" onSubmit={(event) => void onSubmit(event)}>
      <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-black/20 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
          <UserIcon className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Editing Student</p>
          <p className="text-xs text-slate-500">@{username}</p>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Personal Data</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Name</FieldLabel>
            <Input value={form.name} onChange={onChange('name')} required />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Paternal Surname</FieldLabel>
            <Input value={form.paternalSurname} onChange={onChange('paternalSurname')} required />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Maternal Surname</FieldLabel>
            <Input value={form.maternalSurname} onChange={onChange('maternalSurname')} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>DNI</FieldLabel>
            <Input value={form.dni} onChange={onChange('dni')} placeholder="12345678" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Contact</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Email</FieldLabel>
            <Input type="email" value={form.email} onChange={onChange('email')} required />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Phone</FieldLabel>
            <Input value={form.phone} onChange={onChange('phone')} placeholder="999999999" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Student Code</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Student Code</FieldLabel>
            <Input value={form.studentCode} onChange={onChange('studentCode')} placeholder="U20210001" required />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Career</FieldLabel>
            <Input value={form.career} onChange={onChange('career')} placeholder="Ing. de Sistemas" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
