import type { ChangeEvent, FormEvent, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type { CreateStudentFormData } from '../types'

interface CreateStudentFormProps {
  form: CreateStudentFormData
  isSubmitting: boolean
  onChange: (field: keyof CreateStudentFormData) => (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{children}</label>
}

function FormField({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

export function CreateStudentForm({ form, isSubmitting, onChange, onSubmit }: CreateStudentFormProps) {
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
      <FormField>
        <FieldLabel>Username</FieldLabel>
        <Input value={form.username} onChange={onChange('username')} required />
      </FormField>
      <FormField>
        <FieldLabel>Password</FieldLabel>
        <Input type="password" value={form.password} onChange={onChange('password')} minLength={7} required />
      </FormField>
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
        <FieldLabel>Phone</FieldLabel>
        <Input value={form.phone} onChange={onChange('phone')} placeholder="999999999" />
      </FormField>
      <div className="md:col-span-2">
        <FormField>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" value={form.email} onChange={onChange('email')} required />
        </FormField>
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Student'}
        </Button>
      </div>
    </form>
  )
}
